import { randomInt } from "node:crypto";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@is2u/db/client";
import { dateEvents, mediaAssets, memories, missions, users } from "@is2u/db/schema";
import { getServerEnv } from "@is2u/core/env";
import { getMediaR2 } from "@is2u/core/r2";
import { FIXED_USERS, MISSION_TYPES, getMissionTemplate } from "@is2u/core/types";
import { chooseMissionTemplate } from "@is2u/core/missions";
import { requireCsrf } from "../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../lib/http";
import { requireMissionTestAdmin } from "../../../lib/mission-test";
import { getBoss, QUEUES } from "../../../lib/queue";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    recipient: z.enum(["seongmin", "seoyeong", "random"]),
    missionType: z.enum([...MISSION_TYPES, "random"]),
    delay: z.enum(["now", "one-minute"]),
  }),
  z.object({ action: z.literal("expire"), missionId: z.uuid() }),
  z.object({ action: z.literal("delete"), missionId: z.uuid() }),
  z.object({ action: z.literal("reset") }),
]);

async function findTestMission(id: string) {
  return (await getDb().select().from(missions).where(and(eq(missions.id, id), eq(missions.isTest, true))).limit(1))[0];
}

async function deleteTestMission(id: string): Promise<void> {
  const db = getDb();
  const mission = await findTestMission(id);
  if (!mission) throw new HttpError(404, "테스트 미션을 찾을 수 없어요.");
  if (mission.jobId) await (await getBoss()).cancel(QUEUES.deliverMission, mission.jobId).catch(() => undefined);

  const memoryRows = await db.select().from(memories).where(eq(memories.missionId, id));
  const memoryIds = memoryRows.map((memory) => memory.id);
  const assets = memoryIds.length ? await db.select().from(mediaAssets).where(inArray(mediaAssets.memoryId, memoryIds)) : [];
  if (assets.length) {
    const env = getServerEnv();
    await getMediaR2().send(new DeleteObjectsCommand({
      Bucket: env.R2_MEDIA_BUCKET,
      Delete: { Objects: assets.map((asset) => ({ Key: asset.storageKey })), Quiet: true },
    }));
  }

  await db.transaction(async (tx) => {
    if (memoryIds.length) await tx.delete(memories).where(inArray(memories.id, memoryIds));
    await tx.delete(missions).where(eq(missions.id, id));
    await tx.delete(dateEvents).where(and(eq(dateEvents.id, mission.dateEventId), eq(dateEvents.isTest, true)));
  });
}

async function listTestMissions(currentUserId: string) {
  const db = getDb();
  const rows = await db.select({ mission: missions, recipientName: users.displayName })
    .from(missions)
    .innerJoin(users, eq(missions.recipientId, users.id))
    .where(eq(missions.isTest, true))
    .orderBy(desc(missions.createdAt))
    .limit(30);
  const missionIds = rows.map(({ mission }) => mission.id);
  const memoryRows = missionIds.length ? await db.select().from(memories).where(and(
    inArray(memories.missionId, missionIds),
    isNull(memories.deletedAt),
    eq(memories.pendingReplacement, false),
  )).orderBy(desc(memories.createdAt)) : [];
  const memoryIds = memoryRows.map((memory) => memory.id);
  const assets = memoryIds.length ? await db.select({ id: mediaAssets.id, memoryId: mediaAssets.memoryId, role: mediaAssets.role, processingStatus: mediaAssets.processingStatus })
    .from(mediaAssets).where(inArray(mediaAssets.memoryId, memoryIds)) : [];

  return rows.map(({ mission, recipientName }) => {
    const memory = memoryRows.find((candidate) => candidate.missionId === mission.id) ?? null;
    return {
      id: mission.id,
      type: mission.type,
      status: mission.status,
      scheduledAt: mission.scheduledAt,
      sentAt: mission.sentAt,
      expiresAt: mission.expiresAt,
      recipientId: mission.recipientId,
      recipientName,
      copy: getMissionTemplate(mission.templateId, mission.type),
      canOpen: mission.recipientId === currentUserId,
      memory: memory ? {
        id: memory.id,
        type: memory.type,
        assets: assets.filter((asset) => asset.memoryId === memory.id),
      } : null,
    };
  });
}

export const GET = withApiErrors(async (request: Request) => {
  const session = await requireMissionTestAdmin(request);
  return json({ missions: await listTestMissions(session.user.id) });
});

export const POST = withApiErrors(async (request: Request) => {
  const session = await requireMissionTestAdmin(request);
  await requireCsrf(request, session);
  const input = requestSchema.parse(await readJson(request));
  const db = getDb();

  if (input.action === "create") {
    const recipientId = input.recipient === "random"
      ? [FIXED_USERS.seongmin.id, FIXED_USERS.seoyeong.id][randomInt(2)]
      : FIXED_USERS[input.recipient].id;
    const requestedType = input.missionType === "random" ? null : input.missionType;
    const selectedTemplate = chooseMissionTemplate([], requestedType);
    const now = new Date();
    const scheduledAt = new Date(now.getTime() + (input.delay === "one-minute" ? 60_000 : 0));
    const result = await db.transaction(async (tx) => {
      const [dateEvent] = await tx.insert(dateEvents).values({
        startAt: new Date(now.getTime() - 5 * 60_000),
        endAt: new Date(now.getTime() + 2 * 60 * 60_000),
        title: "미션 테스트",
        status: "active",
        isTest: true,
        createdBy: session.user.id,
      }).returning();
      const [mission] = await tx.insert(missions).values({
        dateEventId: dateEvent.id,
        recipientId,
        type: selectedTemplate.type,
        templateId: selectedTemplate.id,
        scheduledAt,
        status: "scheduled",
        isTest: true,
      }).returning();
      return { dateEvent, mission };
    });

    try {
      const jobId = await (await getBoss()).sendAfter(QUEUES.deliverMission, { missionId: result.mission.id }, { retryLimit: 2 }, scheduledAt);
      await db.update(missions).set({ jobId, updatedAt: new Date() }).where(eq(missions.id, result.mission.id));
    } catch (error) {
      await deleteTestMission(result.mission.id);
      throw error;
    }
    return json({ missionId: result.mission.id }, 201);
  }

  if (input.action === "expire") {
    const mission = await findTestMission(input.missionId);
    if (!mission) throw new HttpError(404, "테스트 미션을 찾을 수 없어요.");
    if (mission.jobId) await (await getBoss()).cancel(QUEUES.deliverMission, mission.jobId).catch(() => undefined);
    await db.update(missions).set({ status: "expired", expiresAt: new Date(), updatedAt: new Date() }).where(eq(missions.id, mission.id));
    return json({ ok: true });
  }

  if (input.action === "delete") {
    await deleteTestMission(input.missionId);
    return json({ ok: true });
  }

  const all = await db.select({ id: missions.id }).from(missions).where(eq(missions.isTest, true));
  for (const mission of all) await deleteTestMission(mission.id);
  return json({ ok: true, deleted: all.length });
});
