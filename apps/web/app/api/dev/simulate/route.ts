import { and, desc, eq, inArray, like } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@is2u/db/client";
import { dateEvents, mediaAssets, memories, missions, processingJobs, uploadSessions } from "@is2u/db/schema";
import { getServerEnv } from "@is2u/core/env";
import { MISSION_TYPES } from "@is2u/core/types";
import { requireCsrf, requireSession } from "../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../lib/http";
import { scheduleMissionForDate } from "../../../../lib/scheduler";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create-active-date") }),
  z.object({ action: z.literal("force-mission"), missionType: z.enum(MISSION_TYPES) }),
  z.object({ action: z.literal("advance"), minutes: z.number().int().min(1).max(1_440) }),
  z.object({ action: z.literal("reset") }),
]);

function assertDev() {
  const env = getServerEnv();
  if (env.NODE_ENV === "production" || env.DEV_SIMULATOR_ENABLED !== "true") throw new HttpError(404, "찾을 수 없습니다.");
}

export const GET = withApiErrors(async (request: Request) => {
  assertDev(); await requireSession(request);
  const db = getDb();
  const events = await db.select().from(dateEvents).where(like(dateEvents.title, "[DEV]%")).orderBy(desc(dateEvents.createdAt));
  const eventIds = events.map((event) => event.id);
  const missionRows = eventIds.length ? await db.select().from(missions).where(inArray(missions.dateEventId, eventIds)).orderBy(desc(missions.createdAt)) : [];
  const jobs = await db.select().from(processingJobs).orderBy(desc(processingJobs.createdAt)).limit(20);
  return json({ events, missions: missionRows, processingJobs: jobs });
});

export const POST = withApiErrors(async (request: Request) => {
  assertDev();
  const session = await requireSession(request); await requireCsrf(request, session);
  const input = schema.parse(await readJson(request));
  const db = getDb();
  if (input.action === "create-active-date") {
    const now = Date.now();
    const [event] = await db.insert(dateEvents).values({ title: `[DEV] ${new Date().toISOString()}`, startAt: new Date(now - 21 * 60_000), endAt: new Date(now + 60 * 60_000), status: "active", createdBy: session.user.id }).returning();
    await scheduleMissionForDate(event.id);
    return json({ event }, 201);
  }
  const [event] = await db.select().from(dateEvents).where(like(dateEvents.title, "[DEV]%")).orderBy(desc(dateEvents.createdAt)).limit(1);
  if (input.action === "force-mission") {
    if (!event) throw new HttpError(409, "먼저 개발용 일정을 만들어 주세요.");
    await db.delete(missions).where(and(eq(missions.dateEventId, event.id), eq(missions.status, "scheduled")));
    const now = new Date();
    const [mission] = await db.insert(missions).values({ dateEventId: event.id, recipientId: session.user.id, type: input.missionType, scheduledAt: now, sentAt: now, expiresAt: new Date(now.getTime() + 30 * 60_000), status: "sent" }).onConflictDoUpdate({ target: missions.dateEventId, set: { recipientId: session.user.id, type: input.missionType, sentAt: now, expiresAt: new Date(now.getTime() + 30 * 60_000), status: "sent", updatedAt: now } }).returning();
    return json({ mission }, 201);
  }
  if (input.action === "advance") {
    const events = await db.select().from(dateEvents).where(like(dateEvents.title, "[DEV]%"));
    const offset = input.minutes * 60_000;
    for (const item of events) {
      await db.update(dateEvents).set({ startAt: new Date(item.startAt.getTime() - offset), endAt: new Date(item.endAt.getTime() - offset), updatedAt: new Date() }).where(eq(dateEvents.id, item.id));
      const related = await db.select().from(missions).where(eq(missions.dateEventId, item.id));
      for (const mission of related) await db.update(missions).set({ scheduledAt: new Date(mission.scheduledAt.getTime() - offset), expiresAt: mission.expiresAt ? new Date(mission.expiresAt.getTime() - offset) : null, updatedAt: new Date() }).where(eq(missions.id, mission.id));
    }
    return json({ advancedMinutes: input.minutes });
  }
  if (input.action === "reset") {
    const events = await db.select({ id: dateEvents.id }).from(dateEvents).where(like(dateEvents.title, "[DEV]%"));
    const eventIds = events.map((item) => item.id);
    if (eventIds.length) {
      const memoryRows = await db.select({ id: memories.id }).from(memories).where(inArray(memories.dateEventId, eventIds));
      const memoryIds = memoryRows.map((item) => item.id);
      if (memoryIds.length) {
        const assets = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(inArray(mediaAssets.memoryId, memoryIds));
        const assetIds = assets.map((item) => item.id);
        if (assetIds.length) { await db.delete(processingJobs).where(inArray(processingJobs.assetId, assetIds)); await db.delete(uploadSessions).where(inArray(uploadSessions.assetId, assetIds)); }
        await db.delete(mediaAssets).where(inArray(mediaAssets.memoryId, memoryIds));
        await db.delete(memories).where(inArray(memories.id, memoryIds));
      }
      await db.delete(missions).where(inArray(missions.dateEventId, eventIds));
      await db.delete(dateEvents).where(inArray(dateEvents.id, eventIds));
    }
    return json({ reset: true });
  }
  throw new HttpError(400, "지원하지 않는 작업입니다.");
});

