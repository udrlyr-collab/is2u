import { and, count, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { coupleSettings, dateEvents, missions, users } from "@is2u/db/schema";
import { canCreateActualMission, chooseMissionTemplate, chooseMissionTime, chooseRecipient, seoulWeekBounds } from "@is2u/core/missions";
import { getServerEnv } from "@is2u/core/env";
import { getBoss, QUEUES } from "./queue";

export async function cancelScheduledMission(dateEventId: string): Promise<void> {
  const db = getDb();
  const pending = await db.select().from(missions).where(and(
    eq(missions.dateEventId, dateEventId),
    eq(missions.isTest, false),
    inArray(missions.status, ["scheduled", "sent"]),
  ));
  if (!pending.length) return;
  const boss = await getBoss();
  await Promise.all(pending.map((mission) => mission.jobId
    ? boss.cancel(QUEUES.deliverMission, mission.jobId).catch(() => undefined)
    : Promise.resolve()));
  await db.update(missions).set({ status: "cancelled", updatedAt: new Date() }).where(inArray(missions.id, pending.map((mission) => mission.id)));
}

export async function scheduleMissionForDate(dateEventId: string): Promise<void> {
  const db = getDb();
  const env = getServerEnv();
  const [event] = await db.select().from(dateEvents).where(and(eq(dateEvents.id, dateEventId), isNull(dateEvents.deletedAt))).limit(1);
  const now = new Date();
  if (!event || !canCreateActualMission(event, now)) return;

  const [already] = await db.select().from(missions).where(and(eq(missions.dateEventId, dateEventId), eq(missions.isTest, false))).limit(1);
  if (already && already.status !== "cancelled") return;

  const scheduledAt = chooseMissionTime(event.startAt, event.endAt, {
    timezone: env.APP_TIMEZONE,
    notificationStartHour: env.MISSION_NOTIFICATION_START_HOUR,
    notificationEndHour: env.MISSION_NOTIFICATION_END_HOUR,
    notBefore: now,
  });
  if (!scheduledAt) return;

  const week = seoulWeekBounds(scheduledAt);
  const [settings] = await db.select().from(coupleSettings).where(eq(coupleSettings.id, 1)).limit(1);
  const [weekly] = await db.select({ value: count() }).from(missions).where(and(
    eq(missions.isTest, false), gte(missions.scheduledAt, week.start), lt(missions.scheduledAt, week.end), inArray(missions.status, ["scheduled", "sent", "completed", "skipped", "expired"]),
  ));
  if (Number(weekly?.value ?? 0) >= (settings?.weeklyMissionLimit ?? env.MISSION_WEEKLY_LIMIT)) return;

  const recentTemplates = await db.select({ templateId: missions.templateId }).from(missions)
    .where(and(eq(missions.isTest, false), inArray(missions.status, ["sent", "completed", "skipped", "expired"])))
    .orderBy(desc(missions.sentAt)).limit(3);
  const delivered = await db.select({ recipientId: missions.recipientId, value: count() }).from(missions).where(and(eq(missions.isTest, false), inArray(missions.status, ["sent", "completed", "skipped", "expired"]))).groupBy(missions.recipientId);
  const recipients = await db.select({ id: users.id }).from(users).orderBy(users.id);
  if (recipients.length !== 2) throw new Error("고정 사용자가 정확히 두 명이어야 합니다.");
  const counts = new Map(delivered.map((item) => [item.recipientId, Number(item.value)]));
  const recipientId = chooseRecipient(
    { id: recipients[0].id, delivered: counts.get(recipients[0].id) ?? 0 },
    { id: recipients[1].id, delivered: counts.get(recipients[1].id) ?? 0 },
  );
  const selectedTemplate = chooseMissionTemplate(recentTemplates.map((item) => item.templateId).filter((id): id is string => Boolean(id)));

  const [created] = already
    ? await db.update(missions).set({
      recipientId,
      type: selectedTemplate.type,
      templateId: selectedTemplate.id,
      scheduledAt,
      sentAt: null,
      expiresAt: null,
      status: "scheduled",
      jobId: null,
      updatedAt: now,
    }).where(and(eq(missions.id, already.id), eq(missions.status, "cancelled"))).returning()
    : await db.insert(missions).values({ dateEventId, recipientId, type: selectedTemplate.type, templateId: selectedTemplate.id, scheduledAt, isTest: false }).onConflictDoNothing().returning();
  if (!created) return;
  try {
    const jobId = await (await getBoss()).sendAfter(QUEUES.deliverMission, { missionId: created.id }, { retryLimit: 2 }, scheduledAt);
    await db.update(missions).set({ jobId, updatedAt: new Date() }).where(eq(missions.id, created.id));
  } catch (error) {
    await db.update(missions).set({ status: "cancelled", updatedAt: new Date() }).where(eq(missions.id, created.id));
    throw error;
  }
}
