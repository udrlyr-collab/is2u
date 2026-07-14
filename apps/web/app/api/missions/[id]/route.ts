import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { dateEvents, mediaAssets, memories, missions, users } from "@is2u/db/schema";
import { getMissionTemplate } from "@is2u/core/types";
import { requireSession } from "../../../../lib/auth";
import { HttpError, json, withApiErrors } from "../../../../lib/http";

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
    .innerJoin(dateEvents, eq(missions.dateEventId, dateEvents.id))
    .innerJoin(users, eq(missions.recipientId, users.id))
    .where(eq(missions.id, id))
    .limit(1);
  if (!row || (row.mission.recipientId !== session.user.id && row.mission.status !== "completed")) throw new HttpError(404, "미션을 찾을 수 없습니다.");

  const [memory] = await db.select().from(memories).where(and(
    eq(memories.missionId, id),
    isNull(memories.deletedAt),
    eq(memories.pendingReplacement, false),
  )).orderBy(desc(memories.createdAt)).limit(1);
  const assets = memory ? await db.select().from(mediaAssets).where(eq(mediaAssets.memoryId, memory.id)) : [];
  const [author] = memory ? await db.select({ id: users.id, displayName: users.displayName, roleLabel: users.roleLabel })
    .from(users).where(eq(users.id, memory.createdBy)).limit(1) : [];

  return json({
    mission: { ...row.mission, copy: getMissionTemplate(row.mission.templateId, row.mission.type) },
    dateEvent: row.dateEvent,
    recipient: { id: row.recipient.id, displayName: row.recipient.displayName, roleLabel: row.recipient.roleLabel },
    memory: memory ? { ...memory, assets: assets.map(publicAsset), author } : null,
    canRedo: Boolean(memory && memory.createdBy === session.user.id && row.mission.recipientId === session.user.id),
    canDelete: Boolean(memory && memory.createdBy === session.user.id),
  });
});
