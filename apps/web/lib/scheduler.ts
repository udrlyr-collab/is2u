import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { coupleSettings, couples, dateEvents, dateMissionSchedules, missions } from "@is2u/db/schema";
import { MISSION_END_BUFFER_MINUTES, nextRecurringMissionAt } from "@is2u/core/missions";
import { getBoss, QUEUES } from "./queue";

export const OPERATIONAL_MISSION_SOURCES = ["scheduled_random", "automatic"] as const;
const DEFAULT_MIN_INTERVAL_MINUTES = 40;
const DEFAULT_MAX_INTERVAL_MINUTES = 90;
const DELIVERED_STATUSES = ["sent", "completed", "skipped", "expired"] as const;

type ScheduleEvent = typeof dateEvents.$inferSelect;

function scheduleStatus(event: ScheduleEvent, nextMissionAt: Date | null, now: Date): "waiting" | "active" | "completed" | "cancelled" {
  if (event.deletedAt || event.status === "cancelled") return "cancelled";
  if (!nextMissionAt || event.endAt <= now) return "completed";
  return event.startAt > now ? "waiting" : "active";
}

function baselineFor(event: ScheduleEvent, now: Date, lastMissionAt?: Date | null): Date {
  if (event.startAt > now) return event.startAt;
  return new Date(Math.max(now.getTime(), lastMissionAt?.getTime() ?? 0));
}

function nextFor(event: ScheduleEvent, baseline: Date, minMinutes: number, maxMinutes: number): Date | null {
  return nextRecurringMissionAt(baseline, event.endAt, minMinutes, maxMinutes, Math.random, MISSION_END_BUFFER_MINUTES);
}

async function cancelLegacyJobs(jobIds: Array<string | null>): Promise<void> {
  const ids = jobIds.filter((jobId): jobId is string => Boolean(jobId));
  if (!ids.length) return;
  const boss = await getBoss();
  await Promise.all(ids.map((jobId) => boss.cancel(QUEUES.deliverMission, jobId).catch(() => undefined)));
}

export async function scheduleMissionForDate(dateEventId: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from date_events where id = ${dateEventId} for update`);
    const [row] = await tx.select({ event: dateEvents, coupleStatus: couples.status }).from(dateEvents)
      .innerJoin(couples, eq(dateEvents.coupleId, couples.id))
      .where(eq(dateEvents.id, dateEventId)).limit(1);
    if (!row || row.event.isTest) return;
    await tx.execute(sql`select id from couples where id = ${row.event.coupleId} for update`);

    const [existing] = await tx.select().from(dateMissionSchedules).where(eq(dateMissionSchedules.dateEventId, dateEventId)).limit(1);
    if (row.coupleStatus !== "active" || row.event.deletedAt || row.event.status === "cancelled" || row.event.endAt <= now) {
      if (existing) await tx.update(dateMissionSchedules).set({ nextMissionAt: null, status: row.event.status === "cancelled" || row.event.deletedAt ? "cancelled" : "completed", updatedAt: now }).where(eq(dateMissionSchedules.id, existing.id));
      return;
    }
    if (existing && ["waiting", "active"].includes(existing.status) && existing.nextMissionAt) return;
    if (existing?.status === "completed") return;

    const [settings] = await tx.select().from(coupleSettings).where(eq(coupleSettings.coupleId, row.event.coupleId)).limit(1);
    const history = await tx.select({ recipientId: missions.recipientId, sentAt: missions.sentAt, scheduledAt: missions.scheduledAt }).from(missions).where(and(
      eq(missions.dateEventId, dateEventId), eq(missions.isTest, false), inArray(missions.source, [...OPERATIONAL_MISSION_SOURCES]),
      inArray(missions.status, [...DELIVERED_STATUSES]), isNull(missions.deletedAt),
    )).orderBy(desc(missions.sentAt), desc(missions.scheduledAt));
    const counts = history.reduce<Record<string, number>>((result, mission) => {
      result[mission.recipientId] = (result[mission.recipientId] ?? 0) + 1;
      return result;
    }, {});
    const lastMissionAt = history[0]?.sentAt ?? history[0]?.scheduledAt ?? null;
    const nextMissionAt = nextFor(
      row.event,
      baselineFor(row.event, now, lastMissionAt),
      settings?.missionIntervalMinMinutes ?? DEFAULT_MIN_INTERVAL_MINUTES,
      settings?.missionIntervalMaxMinutes ?? DEFAULT_MAX_INTERVAL_MINUTES,
    );
    const values = {
      coupleId: row.event.coupleId,
      nextMissionAt,
      lastMissionAt,
      lastRecipientUserId: history[0]?.recipientId ?? null,
      missionsSentCount: history.length,
      recipientCounts: counts,
      status: scheduleStatus(row.event, nextMissionAt, now),
      dispatchKey: randomUUID(),
      updatedAt: now,
    } as const;
    await tx.insert(dateMissionSchedules).values({ dateEventId, ...values }).onConflictDoUpdate({
      target: dateMissionSchedules.dateEventId,
      set: values,
    });
  });
}

export async function rescheduleMissionForDate(dateEventId: string): Promise<void> {
  const db = getDb();
  const pending = await db.select({ id: missions.id, jobId: missions.jobId }).from(missions).where(and(
    eq(missions.dateEventId, dateEventId), eq(missions.isTest, false), inArray(missions.source, [...OPERATIONAL_MISSION_SOURCES]),
    eq(missions.status, "scheduled"), isNull(missions.deletedAt),
  ));
  if (pending.length) await db.update(missions).set({ status: "cancelled", updatedAt: new Date() }).where(inArray(missions.id, pending.map((mission) => mission.id)));
  await cancelLegacyJobs(pending.map((mission) => mission.jobId));

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from date_events where id = ${dateEventId} for update`);
    const [row] = await tx.select({ event: dateEvents, coupleStatus: couples.status }).from(dateEvents)
      .innerJoin(couples, eq(dateEvents.coupleId, couples.id)).where(eq(dateEvents.id, dateEventId)).limit(1);
    if (!row || row.event.isTest) return;
    await tx.execute(sql`select id from couples where id = ${row.event.coupleId} for update`);
    const [settings] = await tx.select().from(coupleSettings).where(eq(coupleSettings.coupleId, row.event.coupleId)).limit(1);
    const history = await tx.select({ recipientId: missions.recipientId, sentAt: missions.sentAt, scheduledAt: missions.scheduledAt }).from(missions).where(and(
      eq(missions.dateEventId, dateEventId), eq(missions.isTest, false), inArray(missions.source, [...OPERATIONAL_MISSION_SOURCES]),
      inArray(missions.status, [...DELIVERED_STATUSES]), isNull(missions.deletedAt),
    )).orderBy(desc(missions.sentAt), desc(missions.scheduledAt));
    const counts = history.reduce<Record<string, number>>((result, mission) => {
      result[mission.recipientId] = (result[mission.recipientId] ?? 0) + 1;
      return result;
    }, {});
    const lastMissionAt = history[0]?.sentAt ?? history[0]?.scheduledAt ?? null;
    const baseline = row.event.startAt > now ? row.event.startAt : now;
    const nextMissionAt = row.coupleStatus === "active" && !row.event.deletedAt && row.event.status !== "cancelled" && row.event.endAt > now
      ? nextFor(row.event, baseline, settings?.missionIntervalMinMinutes ?? DEFAULT_MIN_INTERVAL_MINUTES, settings?.missionIntervalMaxMinutes ?? DEFAULT_MAX_INTERVAL_MINUTES)
      : null;
    const values = {
      coupleId: row.event.coupleId,
      nextMissionAt,
      lastMissionAt,
      lastRecipientUserId: history[0]?.recipientId ?? null,
      missionsSentCount: history.length,
      recipientCounts: counts,
      status: row.coupleStatus === "active" ? scheduleStatus(row.event, nextMissionAt, now) : "cancelled" as const,
      dispatchKey: randomUUID(),
      updatedAt: now,
    };
    await tx.insert(dateMissionSchedules).values({ dateEventId, ...values }).onConflictDoUpdate({ target: dateMissionSchedules.dateEventId, set: values });
  });
}

export async function cancelScheduledMission(dateEventId: string): Promise<void> {
  const db = getDb();
  const pending = await db.select({ id: missions.id, jobId: missions.jobId }).from(missions).where(and(
    eq(missions.dateEventId, dateEventId), eq(missions.isTest, false), inArray(missions.source, [...OPERATIONAL_MISSION_SOURCES]),
    isNull(missions.deletedAt), inArray(missions.status, ["scheduled", "sent"]),
  ));
  const now = new Date();
  await db.transaction(async (tx) => {
    if (pending.length) await tx.update(missions).set({ status: "cancelled", updatedAt: now }).where(inArray(missions.id, pending.map((mission) => mission.id)));
    await tx.update(dateMissionSchedules).set({ nextMissionAt: null, status: "cancelled", dispatchKey: randomUUID(), updatedAt: now }).where(eq(dateMissionSchedules.dateEventId, dateEventId));
  });
  await cancelLegacyJobs(pending.map((mission) => mission.jobId));
}

export async function updateMissionIntervalAndReschedule(coupleId: string, minMinutes: number, maxMinutes: number): Promise<{ minMinutes: number; maxMinutes: number }> {
  const db = getDb();
  const now = new Date();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from couples where id = ${coupleId} for update`);
    const [settings] = await tx.insert(coupleSettings).values({
      coupleId,
      missionIntervalMinMinutes: minMinutes,
      missionIntervalMaxMinutes: maxMinutes,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: coupleSettings.coupleId,
      set: { missionIntervalMinMinutes: minMinutes, missionIntervalMaxMinutes: maxMinutes, updatedAt: now },
    }).returning();

    const events = await tx.select().from(dateEvents).where(and(
      eq(dateEvents.coupleId, coupleId), eq(dateEvents.isTest, false), isNull(dateEvents.deletedAt),
      inArray(dateEvents.status, ["scheduled", "active"]), gt(dateEvents.endAt, now),
    ));
    for (const event of events) {
      await tx.execute(sql`select id from date_mission_schedules where date_event_id = ${event.id} for update`);
      const [existing] = await tx.select().from(dateMissionSchedules).where(eq(dateMissionSchedules.dateEventId, event.id)).limit(1);
      const baseline = event.startAt > now ? event.startAt : now;
      const nextMissionAt = nextFor(event, baseline, minMinutes, maxMinutes);
      const values = {
        coupleId,
        nextMissionAt,
        status: scheduleStatus(event, nextMissionAt, now),
        dispatchKey: randomUUID(),
        updatedAt: now,
      } as const;
      if (existing) await tx.update(dateMissionSchedules).set(values).where(eq(dateMissionSchedules.id, existing.id));
      else await tx.insert(dateMissionSchedules).values({ dateEventId: event.id, ...values });
    }
    return { minMinutes: settings.missionIntervalMinMinutes, maxMinutes: settings.missionIntervalMaxMinutes };
  });
}
