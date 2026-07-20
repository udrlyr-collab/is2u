import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, dateEvents, mediaAssets, memories, missions, users } from "@is2u/db/schema";
import { getMissionTemplate, relationshipLabel } from "@is2u/core/types";
import { canEditMemory, canRemoveMissionFromTimeline } from "@is2u/core/permissions";
import { requireCsrf, requireSession } from "../../../../lib/auth";
import { HttpError, json, withApiErrors } from "../../../../lib/http";
import { getBoss, QUEUES } from "../../../../lib/queue";
import { canAccessCouple } from "../../../../lib/couples";

type Context = { params: Promise<{ id: string }> };

function publicAsset(asset: typeof mediaAssets.$inferSelect) {
  return {
    id: asset.id,
    role: asset.role,
    mimeType: asset.mimeType,
    fileSize: asset.fileSize,
    originalFilename: asset.originalFilename,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    processingStatus: asset.processingStatus,
    createdAt: asset.createdAt,
  };
}

export const GET = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  const { id } = await context.params;
  const db = getDb();
  const [row] = await db.select({ mission: missions, dateEvent: dateEvents, recipient: users })
    .from(missions)
    .leftJoin(dateEvents, eq(missions.dateEventId, dateEvents.id))
    .innerJoin(users, eq(missions.recipientId, users.id))
    .where(and(eq(missions.id, id), isNull(missions.deletedAt)))
    .limit(1);
  const isOwnAdminTest = Boolean(row && row.mission.isTest && row.mission.source === "admin_test" && row.mission.recipientId === session.user.id);
  if (!row || (!isOwnAdminTest && !await canAccessCouple(session.user.id, row.mission.coupleId)) || (row.mission.recipientId !== session.user.id && row.mission.status !== "completed")) throw new HttpError(404, "미션을 찾을 수 없어요");

  const [memory] = await db.select().from(memories).where(and(
    eq(memories.missionId, id),
    isNull(memories.deletedAt),
    eq(memories.pendingReplacement, false),
  )).orderBy(desc(memories.createdAt)).limit(1);
  const assets = memory ? await db.select().from(mediaAssets).where(eq(mediaAssets.memoryId, memory.id)) : [];
  const [authorRow] = memory ? await db.select({ id: users.id, displayName: users.displayName, gender: users.gender })
    .from(users).where(eq(users.id, memory.createdBy)).limit(1) : [];
  const author = authorRow ? { ...authorRow, roleLabel: relationshipLabel(authorRow.gender) } : null;
  const [memoryDateEvent] = memory?.dateEventId
    ? await db.select().from(dateEvents).where(and(eq(dateEvents.id, memory.dateEventId), isNull(dateEvents.deletedAt))).limit(1)
    : [];

  return json({
    mission: { ...row.mission, copy: getMissionTemplate(row.mission.templateId, row.mission.type) },
    dateEvent: memory ? memoryDateEvent ?? null : row.dateEvent,
    recipient: { id: row.recipient.id, displayName: row.recipient.displayName, gender: row.recipient.gender, roleLabel: relationshipLabel(row.recipient.gender) },
    memory: memory ? { ...memory, assets: assets.map(publicAsset), author } : null,
    canEdit: canEditMemory({ currentUserId: session.user.id, memoryCreatedBy: memory?.createdBy }),
    canDelete: canRemoveMissionFromTimeline({ currentUserId: session.user.id, recipientId: row.mission.recipientId, memoryCreatedBy: memory?.createdBy }),
  });
});

export const DELETE = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const db = getDb();
  const [mission] = await db.select().from(missions).where(and(eq(missions.id, id), isNull(missions.deletedAt))).limit(1);
  if (!mission) throw new HttpError(404, "미션을 찾을 수 없어요");
  const isOwnAdminTest = mission.isTest && mission.source === "admin_test" && mission.recipientId === session.user.id;
  if (!isOwnAdminTest && !await canAccessCouple(session.user.id, mission.coupleId)) throw new HttpError(404, "미션을 찾을 수 없어요");
  const [memory] = await db.select().from(memories).where(and(
    eq(memories.missionId, id),
    isNull(memories.deletedAt),
    eq(memories.pendingReplacement, false),
  )).orderBy(desc(memories.createdAt)).limit(1);
  if (!canRemoveMissionFromTimeline({ currentUserId: session.user.id, recipientId: mission.recipientId, memoryCreatedBy: memory?.createdBy })) {
    throw new HttpError(403, "이 추억을 떼어낼 수 없어요");
  }

  if (mission.jobId && mission.status === "scheduled") {
    await (await getBoss()).cancel(QUEUES.deliverMission, mission.jobId).catch(() => undefined);
  }
  const now = new Date();
  const purgeAfter = new Date(now.getTime() + 30 * 24 * 60 * 60_000);
  await db.transaction(async (tx) => {
    await tx.update(missions).set({ deletedAt: now, purgeAfter, updatedAt: now }).where(eq(missions.id, id));
    if (memory) await tx.update(memories).set({ deletedAt: now, purgeAfter, updatedAt: now }).where(eq(memories.id, memory.id));
    await tx.insert(auditEvents).values({ actorId: session.user.id, action: "mission.soft_deleted", entityType: "mission", entityId: id });
  });
  return json({ ok: true });
});
