import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import {
  coupleMembers, coupleSettings, couples, dateEvents, dateMissionSchedules, missions, userSettings, users,
} from "@is2u/db/schema";
import {
  MISSION_END_BUFFER_MINUTES, chooseScheduledMissionTemplate, chooseScheduledRecipient, nextRecurringMissionAt,
} from "@is2u/core/missions";
import { getMissionTemplate, userFacingSentence } from "@is2u/core/types";
import { scheduleMissionForDate, OPERATIONAL_MISSION_SOURCES } from "../../web/lib/scheduler";
import { sendUserNotificationWithResult } from "../../web/lib/push";

const DEFAULT_MIN_INTERVAL_MINUTES = 40;
const DEFAULT_MAX_INTERVAL_MINUTES = 90;
const DELIVERED_STATUSES = ["sent", "completed", "skipped", "expired"] as const;
const ALL_CAPABILITIES = ["microphone", "camera", "media-library"] as const;
const NOTIFICATION_CLAIM_TIMEOUT_MS = 5 * 60_000;
const MAX_NOTIFICATION_ATTEMPTS = 3;

type CreatedMission = { id: string; recipientId: string; templateId: string | null; type: "audio" | "photo" | "video" | "text" | "emotion"; notificationKey: string | null };

function nextScheduleAt(now: Date, eventEndAt: Date, minMinutes: number, maxMinutes: number): Date | null {
  return nextRecurringMissionAt(now, eventEndAt, minMinutes, maxMinutes, Math.random, MISSION_END_BUFFER_MINUTES);
}

async function reconcileSchedules(now: Date): Promise<void> {
  const db = getDb();
  const events = await db.select({ id: dateEvents.id }).from(dateEvents)
    .innerJoin(couples, eq(dateEvents.coupleId, couples.id))
    .leftJoin(dateMissionSchedules, eq(dateMissionSchedules.dateEventId, dateEvents.id))
    .where(and(
      eq(couples.status, "active"), eq(dateEvents.isTest, false), isNull(dateEvents.deletedAt),
      inArray(dateEvents.status, ["scheduled", "active"]), gt(dateEvents.endAt, now),
      isNull(dateMissionSchedules.id),
    ));
  for (const event of events) await scheduleMissionForDate(event.id);
}

export async function processDueMissionSchedule(scheduleId: string, now = new Date()): Promise<CreatedMission | null> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from date_mission_schedules where id = ${scheduleId} for update`);
    const [row] = await tx.select({ schedule: dateMissionSchedules, event: dateEvents, coupleStatus: couples.status }).from(dateMissionSchedules)
      .innerJoin(dateEvents, eq(dateMissionSchedules.dateEventId, dateEvents.id))
      .innerJoin(couples, eq(dateMissionSchedules.coupleId, couples.id))
      .where(eq(dateMissionSchedules.id, scheduleId)).limit(1);
    if (!row || !["waiting", "active"].includes(row.schedule.status) || !row.schedule.nextMissionAt || row.schedule.nextMissionAt > now) return null;

    if (row.coupleStatus !== "active" || row.event.deletedAt || row.event.status === "cancelled") {
      await tx.update(dateMissionSchedules).set({ nextMissionAt: null, status: "cancelled", updatedAt: now }).where(eq(dateMissionSchedules.id, scheduleId));
      return null;
    }
    const lastAllowedAt = new Date(row.event.endAt.getTime() - MISSION_END_BUFFER_MINUTES * 60_000);
    if (row.event.endAt <= now || now > lastAllowedAt || row.schedule.nextMissionAt > lastAllowedAt) {
      await tx.update(dateMissionSchedules).set({ nextMissionAt: null, status: "completed", updatedAt: now }).where(eq(dateMissionSchedules.id, scheduleId));
      return null;
    }
    if (row.event.startAt > now) {
      await tx.update(dateMissionSchedules).set({ status: "waiting", updatedAt: now }).where(eq(dateMissionSchedules.id, scheduleId));
      return null;
    }
    if (row.event.status === "scheduled") {
      await tx.update(dateEvents).set({ status: "active", updatedAt: now }).where(eq(dateEvents.id, row.event.id));
    } else if (row.event.status !== "active") {
      await tx.update(dateMissionSchedules).set({ nextMissionAt: null, status: "completed", updatedAt: now }).where(eq(dateMissionSchedules.id, scheduleId));
      return null;
    }

    const [settings] = await tx.select().from(coupleSettings).where(eq(coupleSettings.coupleId, row.event.coupleId)).limit(1);
    const minMinutes = settings?.missionIntervalMinMinutes ?? DEFAULT_MIN_INTERVAL_MINUTES;
    const maxMinutes = settings?.missionIntervalMaxMinutes ?? DEFAULT_MAX_INTERVAL_MINUTES;
    const recipients = await tx.select({
      id: users.id,
      capabilities: userSettings.missionCapabilities,
    }).from(coupleMembers)
      .innerJoin(users, eq(coupleMembers.userId, users.id))
      .leftJoin(userSettings, eq(userSettings.userId, users.id))
      .where(and(
        eq(coupleMembers.coupleId, row.event.coupleId), isNull(coupleMembers.leftAt),
        eq(users.accountStatus, "active"), isNull(users.deletedAt),
      ));
    if (!recipients.length) {
      const nextMissionAt = nextScheduleAt(now, row.event.endAt, minMinutes, maxMinutes);
      await tx.update(dateMissionSchedules).set({ nextMissionAt, status: nextMissionAt ? "active" : "completed", dispatchKey: randomUUID(), updatedAt: now }).where(eq(dateMissionSchedules.id, scheduleId));
      return null;
    }

    const history = await tx.select({ recipientId: missions.recipientId, templateId: missions.templateId, sentAt: missions.sentAt, scheduledAt: missions.scheduledAt }).from(missions).where(and(
      eq(missions.coupleId, row.event.coupleId), eq(missions.isTest, false), inArray(missions.source, [...OPERATIONAL_MISSION_SOURCES]),
      inArray(missions.status, [...DELIVERED_STATUSES]), isNull(missions.deletedAt),
    )).orderBy(desc(missions.sentAt), desc(missions.scheduledAt));
    const open = await tx.select({ recipientId: missions.recipientId }).from(missions).where(and(
      eq(missions.coupleId, row.event.coupleId), eq(missions.isTest, false), inArray(missions.source, [...OPERATIONAL_MISSION_SOURCES]),
      eq(missions.status, "sent"), gt(missions.expiresAt, now), isNull(missions.deletedAt),
    ));
    const deliveredCounts = new Map<string, number>();
    const openCounts = new Map<string, number>();
    for (const mission of history) deliveredCounts.set(mission.recipientId, (deliveredCounts.get(mission.recipientId) ?? 0) + 1);
    for (const mission of open) openCounts.set(mission.recipientId, (openCounts.get(mission.recipientId) ?? 0) + 1);
    const recipientId = chooseScheduledRecipient(
      recipients.map((recipient) => ({ id: recipient.id, delivered: deliveredCounts.get(recipient.id) ?? 0, open: openCounts.get(recipient.id) ?? 0 })),
      history.slice(0, 2).map((mission) => mission.recipientId),
    );
    if (!recipientId) {
      const nextMissionAt = nextScheduleAt(now, row.event.endAt, minMinutes, maxMinutes);
      await tx.update(dateMissionSchedules).set({ nextMissionAt, status: nextMissionAt ? "active" : "completed", dispatchKey: randomUUID(), updatedAt: now }).where(eq(dateMissionSchedules.id, scheduleId));
      return null;
    }

    const dateHistory = await tx.select({ templateId: missions.templateId }).from(missions).where(and(
      eq(missions.dateEventId, row.event.id), eq(missions.isTest, false), inArray(missions.source, [...OPERATIONAL_MISSION_SOURCES]),
      inArray(missions.status, [...DELIVERED_STATUSES]), isNull(missions.deletedAt),
    ));
    const recipient = recipients.find((candidate) => candidate.id === recipientId)!;
    const selectedTemplate = chooseScheduledMissionTemplate({
      recentTemplateIds: history.map((mission) => mission.templateId).filter((id): id is string => Boolean(id)),
      usedTemplateIdsForDate: dateHistory.map((mission) => mission.templateId).filter((id): id is string => Boolean(id)),
      supportedCapabilities: recipient.capabilities ?? ALL_CAPABILITIES,
    });
    const notificationKey = randomUUID();
    const [created] = await tx.insert(missions).values({
      coupleId: row.event.coupleId,
      dateEventId: row.event.id,
      recipientId,
      type: selectedTemplate.type,
      templateId: selectedTemplate.id,
      scheduledAt: row.schedule.nextMissionAt,
      sentAt: now,
      expiresAt: new Date(now.getTime() + 30 * 60_000),
      status: "sent",
      isTest: false,
      source: "scheduled_random",
      scheduleDispatchKey: row.schedule.dispatchKey,
      notificationKey,
      notificationStatus: "pending",
    }).onConflictDoNothing({ target: missions.scheduleDispatchKey }).returning({
      id: missions.id,
      recipientId: missions.recipientId,
      templateId: missions.templateId,
      type: missions.type,
      notificationKey: missions.notificationKey,
    });
    if (!created) return null;

    const nextMissionAt = nextScheduleAt(now, row.event.endAt, minMinutes, maxMinutes);
    const recipientCounts = { ...(row.schedule.recipientCounts ?? {}) };
    recipientCounts[recipientId] = (recipientCounts[recipientId] ?? 0) + 1;
    await tx.update(dateMissionSchedules).set({
      nextMissionAt,
      lastMissionAt: now,
      lastRecipientUserId: recipientId,
      missionsSentCount: row.schedule.missionsSentCount + 1,
      recipientCounts,
      status: nextMissionAt ? "active" : "completed",
      dispatchKey: randomUUID(),
      updatedAt: now,
    }).where(eq(dateMissionSchedules.id, scheduleId));
    return created;
  });
}

export async function deliverScheduledMissionNotification(missionId: string, now = new Date()): Promise<void> {
  const db = getDb();
  const claimed = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from missions where id = ${missionId} for update`);
    const [mission] = await tx.select().from(missions).where(eq(missions.id, missionId)).limit(1);
    const staleBefore = new Date(now.getTime() - NOTIFICATION_CLAIM_TIMEOUT_MS);
    const claimable = mission && mission.source === "scheduled_random" && mission.notificationKey && mission.notificationAttempts < MAX_NOTIFICATION_ATTEMPTS && (
      mission.notificationStatus === "pending" || (mission.notificationStatus === "sending" && Boolean(mission.notificationClaimedAt && mission.notificationClaimedAt < staleBefore))
    );
    if (!claimable) return null;
    const [updated] = await tx.update(missions).set({
      notificationStatus: "sending",
      notificationAttempts: mission.notificationAttempts + 1,
      notificationClaimedAt: now,
      notificationFailureCode: null,
      updatedAt: now,
    }).where(eq(missions.id, missionId)).returning();
    return updated;
  });
  if (!claimed) return;

  try {
    const copy = getMissionTemplate(claimed.templateId, claimed.type);
    const result = await sendUserNotificationWithResult(claimed.recipientId, {
      title: copy.title,
      body: userFacingSentence(copy.prompt),
      url: `/missions/${claimed.id}`,
      missionId: claimed.id,
      notificationKey: claimed.notificationKey ?? undefined,
    });
    const notificationStatus = result.sentCount > 0 ? "sent" : result.subscriptionCount === 0 ? "unavailable" : "failed";
    await db.update(missions).set({
      notificationStatus,
      notificationSentAt: result.sentCount > 0 ? new Date() : null,
      notificationFailureCode: result.sentCount > 0 ? null : result.subscriptionCount === 0 ? "no_subscription" : "push_delivery_failed",
      updatedAt: new Date(),
    }).where(eq(missions.id, missionId));
  } catch {
    await db.update(missions).set({ notificationStatus: "failed", notificationFailureCode: "notification_error", updatedAt: new Date() }).where(eq(missions.id, missionId));
  }
}

export async function runMissionScheduleScan(): Promise<void> {
  const db = getDb();
  const now = new Date();
  await reconcileSchedules(now);
  const due = await db.select({ id: dateMissionSchedules.id }).from(dateMissionSchedules).where(and(
    inArray(dateMissionSchedules.status, ["waiting", "active"]),
    lte(dateMissionSchedules.nextMissionAt, now),
  )).orderBy(asc(dateMissionSchedules.nextMissionAt)).limit(50);
  for (const schedule of due) {
    const created = await processDueMissionSchedule(schedule.id, new Date());
    if (created) await deliverScheduledMissionNotification(created.id);
  }

  const staleBefore = new Date(now.getTime() - NOTIFICATION_CLAIM_TIMEOUT_MS);
  const pendingNotifications = await db.select({ id: missions.id }).from(missions).where(and(
    eq(missions.source, "scheduled_random"), lt(missions.notificationAttempts, MAX_NOTIFICATION_ATTEMPTS),
    or(eq(missions.notificationStatus, "pending"), and(eq(missions.notificationStatus, "sending"), lt(missions.notificationClaimedAt, staleBefore))),
  )).orderBy(asc(missions.createdAt)).limit(50);
  for (const mission of pendingNotifications) await deliverScheduledMissionNotification(mission.id);
}
