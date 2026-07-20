import { randomInt } from "node:crypto";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { and, count, desc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@is2u/db/client";
import { adminTestDispatches, auditEvents, coupleMembers, couples, mediaAssets, memories, missions, users } from "@is2u/db/schema";
import { getServerEnv } from "@is2u/core/env";
import { TEST_MISSION_CATEGORIES, chooseTestMissionTemplate } from "@is2u/core/missions";
import { getMediaR2 } from "@is2u/core/r2";
import { MISSION_TEMPLATES, getMissionTemplate, userFacingSentence } from "@is2u/core/types";
import { requireAdmin } from "../../../../lib/admin";
import { requireCsrf, type AuthSession } from "../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../lib/http";
import { sendUserNotification } from "../../../../lib/push";
import { getBoss, QUEUES } from "../../../../lib/queue";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    recipientMode: z.enum(["random", "self", "user", "couple-random"]),
    recipientUsername: z.string().trim().max(20).optional(),
    coupleId: z.uuid().optional(),
    category: z.enum([...TEST_MISSION_CATEGORIES, "random"]),
    templateId: z.string().trim().max(100),
    delay: z.enum(["now", "one-minute"]),
  }).superRefine((value, context) => {
    if (value.templateId !== "random" && value.category === "random") context.addIssue({ code: "custom", message: "세부 미션을 직접 고를 때는 미션 종류도 골라주세요" });
    if (value.recipientMode === "user" && !value.recipientUsername) context.addIssue({ code: "custom", message: "받는 사람의 아이디를 입력해 주세요" });
  }),
  z.object({ action: z.literal("expire"), missionId: z.uuid() }),
  z.object({ action: z.literal("delete"), missionId: z.uuid() }),
  z.object({ action: z.literal("reset") }),
]);

async function activeCoupleIdForUser(userId: string): Promise<string | null> {
  const [row] = await getDb().select({ id: couples.id }).from(coupleMembers).innerJoin(couples, eq(coupleMembers.coupleId, couples.id)).where(and(eq(coupleMembers.userId, userId), isNull(coupleMembers.leftAt), eq(couples.status, "active"))).limit(1);
  return row?.id ?? null;
}

async function resolveRecipient(session: AuthSession, input: z.infer<typeof requestSchema> & { action: "create" }): Promise<{ id: string; coupleId: string | null }> {
  const db = getDb();
  let id: string;
  if (input.recipientMode === "self") id = session.user.id;
  else if (input.recipientMode === "user") {
    const [target] = await db.select({ id: users.id }).from(users).where(and(eq(users.username, input.recipientUsername!.toLowerCase()), eq(users.accountStatus, "active"))).limit(1);
    if (!target) throw new HttpError(404, "받는 사람의 계정을 찾을 수 없어요");
    id = target.id;
  } else if (input.recipientMode === "couple-random") {
    const activeRows = await db.select({ coupleId: couples.id, userId: users.id }).from(couples).innerJoin(coupleMembers, and(eq(coupleMembers.coupleId, couples.id), isNull(coupleMembers.leftAt))).innerJoin(users, and(eq(coupleMembers.userId, users.id), eq(users.accountStatus, "active"))).where(eq(couples.status, "active"));
    const candidates = [...new Set(activeRows.map((row) => row.coupleId))].filter((coupleId) => activeRows.filter((row) => row.coupleId === coupleId).length === 2);
    if (!candidates.length) throw new HttpError(409, "미션을 받을 수 있는 활성 연결이 없어요");
    const coupleId = candidates[randomInt(candidates.length)];
    const members = activeRows.filter((row) => row.coupleId === coupleId);
    id = members[randomInt(members.length)].userId;
    return { id, coupleId };
  } else {
    const candidates = await db.select({ id: users.id }).from(users).where(and(eq(users.accountStatus, "active"), isNotNull(users.username)));
    if (!candidates.length) throw new HttpError(409, "미션을 받을 수 있는 계정이 없어요");
    id = candidates[randomInt(candidates.length)].id;
  }
  return { id, coupleId: await activeCoupleIdForUser(id) };
}

async function findTestMission(id: string) {
  return (await getDb().select().from(missions).where(and(eq(missions.id, id), eq(missions.isTest, true), eq(missions.source, "admin_test"))).limit(1))[0];
}

async function deleteTestMission(id: string): Promise<void> {
  const db = getDb();
  const mission = await findTestMission(id);
  if (!mission) throw new HttpError(404, "테스트 미션을 찾을 수 없어요");
  if (mission.jobId) await (await getBoss()).cancel(QUEUES.deliverMission, mission.jobId).catch(() => undefined);
  const memoryRows = await db.select({ id: memories.id }).from(memories).where(eq(memories.missionId, id));
  const memoryIds = memoryRows.map((row) => row.id);
  const assets = memoryIds.length ? await db.select({ key: mediaAssets.storageKey }).from(mediaAssets).where(inArray(mediaAssets.memoryId, memoryIds)) : [];
  if (assets.length) await getMediaR2().send(new DeleteObjectsCommand({ Bucket: getServerEnv().R2_MEDIA_BUCKET, Delete: { Objects: assets.map((asset) => ({ Key: asset.key })), Quiet: true } }));
  await db.transaction(async (tx) => {
    if (memoryIds.length) await tx.delete(memories).where(inArray(memories.id, memoryIds));
    await tx.delete(missions).where(eq(missions.id, id));
  });
}

async function listTestMissions(currentUserId: string) {
  const rows = await getDb().select({ mission: missions, recipientName: users.displayName, dispatch: adminTestDispatches }).from(adminTestDispatches)
    .innerJoin(missions, eq(adminTestDispatches.missionId, missions.id)).innerJoin(users, eq(adminTestDispatches.recipientId, users.id))
    .where(and(eq(missions.isTest, true), eq(missions.source, "admin_test"), isNull(missions.deletedAt))).orderBy(desc(adminTestDispatches.createdAt)).limit(50);
  const missionIds = rows.map((row) => row.mission.id);
  const memoryRows = missionIds.length ? await getDb().select().from(memories).where(and(inArray(memories.missionId, missionIds), isNull(memories.deletedAt), eq(memories.pendingReplacement, false))) : [];
  const memoryIds = memoryRows.map((row) => row.id);
  const assets = memoryIds.length ? await getDb().select({ id: mediaAssets.id, memoryId: mediaAssets.memoryId, role: mediaAssets.role, processingStatus: mediaAssets.processingStatus }).from(mediaAssets).where(inArray(mediaAssets.memoryId, memoryIds)) : [];
  return rows.map(({ mission, recipientName, dispatch }) => {
    const memory = memoryRows.find((row) => row.missionId === mission.id) ?? null;
    return { id: mission.id, type: mission.type, status: mission.status, scheduledAt: mission.scheduledAt, sentAt: mission.sentAt, expiresAt: mission.expiresAt, recipientId: mission.recipientId, recipientName, deliveryStatus: dispatch.deliveryStatus, failureCode: dispatch.failureCode, copy: getMissionTemplate(mission.templateId, mission.type), canOpen: mission.recipientId === currentUserId, memory: memory ? { id: memory.id, type: memory.type, assets: assets.filter((asset) => asset.memoryId === memory.id) } : null };
  });
}

export const GET = withApiErrors(async (request: Request) => {
  const session = await requireAdmin(request);
  return json({ missions: await listTestMissions(session.user.id), templates: MISSION_TEMPLATES.filter((template) => template.enabled && TEST_MISSION_CATEGORIES.includes(template.category as (typeof TEST_MISSION_CATEGORIES)[number])) });
});

export const POST = withApiErrors(async (request: Request) => {
  const session = await requireAdmin(request);
  await requireCsrf(request, session);
  const input = requestSchema.parse(await readJson(request));
  const db = getDb();
  if (input.action === "create") {
    const since = new Date(Date.now() - 10 * 60_000);
    const [rate] = await db.select({ value: count() }).from(adminTestDispatches).where(and(eq(adminTestDispatches.adminId, session.user.id), gte(adminTestDispatches.createdAt, since)));
    if (Number(rate?.value ?? 0) >= 10) throw new HttpError(429, "테스트 미션은 10분에 10개까지 만들 수 있어요");
    const recipient = await resolveRecipient(session, input);
    const recentTemplates = await db.select({ templateId: missions.templateId }).from(missions)
      .where(and(eq(missions.isTest, true), eq(missions.source, "admin_test")))
      .orderBy(desc(missions.sentAt), desc(missions.createdAt)).limit(3);
    const template = chooseTestMissionTemplate(
      input.category === "random" ? null : input.category,
      input.templateId === "random" ? null : input.templateId,
      Math.random,
      recentTemplates.map((item) => item.templateId).filter((id): id is string => Boolean(id)),
    );
    const now = new Date();
    const scheduledAt = new Date(now.getTime() + (input.delay === "one-minute" ? 60_000 : 0));
    const isImmediate = input.delay === "now";
    const [mission] = await db.transaction(async (tx) => {
      const [created] = await tx.insert(missions).values({ coupleId: recipient.coupleId, recipientId: recipient.id, type: template.type, templateId: template.id, scheduledAt, status: isImmediate ? "sent" : "scheduled", sentAt: isImmediate ? now : null, expiresAt: isImmediate ? new Date(now.getTime() + 30 * 60_000) : null, isTest: true, source: "admin_test" }).returning();
      await tx.insert(adminTestDispatches).values({ missionId: created.id, adminId: session.user.id, recipientId: recipient.id, deliveryStatus: isImmediate ? "sent" : "scheduled" });
      await tx.insert(auditEvents).values({ actorId: session.user.id, action: "admin.test_created", entityType: "mission", entityId: created.id, metadata: { recipientId: recipient.id, templateId: template.id, delay: input.delay } });
      return [created];
    });
    if (isImmediate) {
      try {
        await sendUserNotification(recipient.id, { title: template.title, body: userFacingSentence(template.prompt), url: `/missions/${mission.id}` });
      } catch {
        await db.transaction(async (tx) => {
          await tx.update(adminTestDispatches).set({ deliveryStatus: "failed", failureCode: "push_delivery_failed", updatedAt: new Date() }).where(eq(adminTestDispatches.missionId, mission.id));
          await tx.insert(auditEvents).values({ actorId: session.user.id, action: "admin.test_failed", entityType: "mission", entityId: mission.id, metadata: { failureCode: "push_delivery_failed" } });
        });
      }
    } else {
      try {
        const jobId = await (await getBoss()).sendAfter(QUEUES.deliverMission, { missionId: mission.id }, { retryLimit: 2 }, scheduledAt);
        await db.update(missions).set({ jobId, updatedAt: new Date() }).where(eq(missions.id, mission.id));
      } catch {
        await db.transaction(async (tx) => {
          await tx.update(missions).set({ status: "cancelled", updatedAt: new Date() }).where(eq(missions.id, mission.id));
          await tx.update(adminTestDispatches).set({ deliveryStatus: "failed", failureCode: "queue_unavailable", updatedAt: new Date() }).where(eq(adminTestDispatches.missionId, mission.id));
          await tx.insert(auditEvents).values({ actorId: session.user.id, action: "admin.test_failed", entityType: "mission", entityId: mission.id, metadata: { failureCode: "queue_unavailable" } });
        });
        throw new HttpError(503, "테스트 미션 예약을 완료하지 못했어요");
      }
    }
    return json({ missionId: mission.id }, 201);
  }
  if (input.action === "expire") {
    const mission = await findTestMission(input.missionId);
    if (!mission) throw new HttpError(404, "테스트 미션을 찾을 수 없어요");
    if (mission.jobId) await (await getBoss()).cancel(QUEUES.deliverMission, mission.jobId).catch(() => undefined);
    await db.update(missions).set({ status: "expired", expiresAt: new Date(), updatedAt: new Date() }).where(eq(missions.id, mission.id));
    await db.insert(auditEvents).values({ actorId: session.user.id, action: "admin.test_expired", entityType: "mission", entityId: mission.id });
    return json({ ok: true });
  }
  if (input.action === "delete") {
    await deleteTestMission(input.missionId);
    await db.insert(auditEvents).values({ actorId: session.user.id, action: "admin.test_deleted", entityType: "mission", entityId: input.missionId });
    return json({ ok: true });
  }
  const rows = await db.select({ missionId: adminTestDispatches.missionId }).from(adminTestDispatches);
  for (const row of rows) await deleteTestMission(row.missionId);
  await db.insert(auditEvents).values({ actorId: session.user.id, action: "admin.test_reset", entityType: "admin_test", metadata: { count: rows.length } });
  return json({ ok: true, deleted: rows.length });
});
