import { and, count, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, coupleInvitations, coupleMembers, coupleSettings, couples, dateEvents, dateMissionSchedules, memories, missions, users } from "@is2u/db/schema";
import { adminCoupleDisconnectSchema } from "@is2u/core/validation";
import { adminFailureCode, requireAdmin, writeAdminAudit } from "../../../../../lib/admin";
import { requireCsrf } from "../../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../../lib/http";
import { sendUserNotification } from "../../../../../lib/push";
import { getBoss, QUEUES } from "../../../../../lib/queue";

export const GET = withApiErrors(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await requireAdmin(request);
  const { id } = await context.params;
  const db = getDb();
  const [couple] = await db.select().from(couples).where(eq(couples.id, id)).limit(1);
  if (!couple) throw new HttpError(404, "연결 기록을 찾을 수 없어요");
  const members = await db.select({ id: users.id, displayName: users.displayName, username: users.username, gender: users.gender, role: users.role, accountStatus: users.accountStatus, joinedAt: coupleMembers.joinedAt, leftAt: coupleMembers.leftAt }).from(coupleMembers).innerJoin(users, eq(coupleMembers.userId, users.id)).where(eq(coupleMembers.coupleId, id));
  const pairKey = members.length === 2 ? [members[0].id, members[1].id].sort().join(":") : null;
  const [settings] = await db.select({ timezone: coupleSettings.timezone, weeklyMissionLimit: coupleSettings.weeklyMissionLimit, randomMissionIntervalMin: coupleSettings.missionIntervalMinMinutes, randomMissionIntervalMax: coupleSettings.missionIntervalMaxMinutes, updatedAt: coupleSettings.updatedAt }).from(coupleSettings).where(eq(coupleSettings.coupleId, id)).limit(1);
  const [dateStatuses, missionStatuses, [memoryCount], recentDates, recentMemories, invitations, scheduleRows, openOperationalMissions] = await Promise.all([
    db.select({ status: dateEvents.status, value: count() }).from(dateEvents).where(and(eq(dateEvents.coupleId, id), eq(dateEvents.isTest, false), isNull(dateEvents.deletedAt))).groupBy(dateEvents.status),
    db.select({ status: missions.status, value: count() }).from(missions).where(and(eq(missions.coupleId, id), eq(missions.isTest, false), isNull(missions.deletedAt))).groupBy(missions.status),
    db.select({ value: count() }).from(memories).leftJoin(missions, eq(memories.missionId, missions.id)).where(and(eq(memories.coupleId, id), isNull(memories.deletedAt), sql`${missions.isTest} IS DISTINCT FROM true`)),
    db.select({ id: dateEvents.id, startAt: dateEvents.startAt, endAt: dateEvents.endAt, status: dateEvents.status, createdAt: dateEvents.createdAt }).from(dateEvents).where(and(eq(dateEvents.coupleId, id), eq(dateEvents.isTest, false), isNull(dateEvents.deletedAt))).orderBy(desc(dateEvents.createdAt)).limit(5),
    db.select({ id: memories.id, type: memories.type, createdAt: memories.createdAt, updatedAt: memories.updatedAt }).from(memories).leftJoin(missions, eq(memories.missionId, missions.id)).where(and(eq(memories.coupleId, id), isNull(memories.deletedAt), eq(memories.pendingReplacement, false), sql`${missions.isTest} IS DISTINCT FROM true`)).orderBy(desc(memories.createdAt)).limit(5),
    pairKey ? db.select({ id: coupleInvitations.id, status: coupleInvitations.status, createdAt: coupleInvitations.createdAt, respondedAt: coupleInvitations.respondedAt, expiresAt: coupleInvitations.expiresAt }).from(coupleInvitations).where(eq(coupleInvitations.pairKey, pairKey)).orderBy(desc(coupleInvitations.createdAt)) : Promise.resolve([]),
    db.select({
      id: dateMissionSchedules.id,
      dateEventId: dateMissionSchedules.dateEventId,
      status: dateMissionSchedules.status,
      nextMissionAt: dateMissionSchedules.nextMissionAt,
      lastMissionAt: dateMissionSchedules.lastMissionAt,
      missionsSentCount: dateMissionSchedules.missionsSentCount,
      recipientCounts: dateMissionSchedules.recipientCounts,
      eventTitle: dateEvents.title,
      eventStartAt: dateEvents.startAt,
      eventEndAt: dateEvents.endAt,
    }).from(dateMissionSchedules).innerJoin(dateEvents, eq(dateMissionSchedules.dateEventId, dateEvents.id))
      .where(eq(dateMissionSchedules.coupleId, id)).orderBy(desc(dateEvents.startAt)).limit(10),
    db.select({ dateEventId: missions.dateEventId }).from(missions).where(and(
      eq(missions.coupleId, id), eq(missions.isTest, false), inArray(missions.source, ["scheduled_random", "automatic"]),
      eq(missions.status, "sent"), gt(missions.expiresAt, new Date()), isNull(missions.deletedAt),
    )),
  ]);
  const maleId = members.find((member) => member.gender === "male")?.id;
  const femaleId = members.find((member) => member.gender === "female")?.id;
  const missionSchedules = scheduleRows.map((schedule) => ({
    ...schedule,
    maleReceivedCount: maleId ? schedule.recipientCounts[maleId] ?? 0 : 0,
    femaleReceivedCount: femaleId ? schedule.recipientCounts[femaleId] ?? 0 : 0,
    openMissionCount: openOperationalMissions.filter((mission) => mission.dateEventId === schedule.dateEventId).length,
  }));
  return json({ couple, members, settings: settings ?? null, dateStatuses, missionStatuses, memoryCount: Number(memoryCount?.value ?? 0), recentDates, recentMemories, invitations, missionSchedules });
});

export const POST = withApiErrors(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(request);
  await requireCsrf(request, admin);
  const { id } = await context.params;
  let auditReason = "unknown";
  try {
    const input = adminCoupleDisconnectSchema.parse(await readJson(request));
    const db = getDb();
    const [couple] = await db.select({ id: couples.id, status: couples.status }).from(couples).where(eq(couples.id, id)).limit(1);
    if (!couple) throw new HttpError(404, "연결 기록을 찾을 수 없어요");
    if (couple.status === "ended") return json({ ok: true, alreadyDisconnected: true });
    const members = await db.select({ id: users.id }).from(coupleMembers).innerJoin(users, eq(coupleMembers.userId, users.id))
      .where(and(eq(coupleMembers.coupleId, id), isNull(coupleMembers.leftAt)));
    const pendingJobs = await db.select({ jobId: missions.jobId }).from(missions).where(and(
      eq(missions.coupleId, id), inArray(missions.status, ["scheduled", "sent"]), isNull(missions.deletedAt),
    ));
    const reason = input.reason === "custom" ? input.customReason! : input.reason;
    auditReason = reason;
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.execute(sql`select id from couples where id = ${id} and status = 'active' for update`);
      const [ended] = await tx.update(couples).set({
        status: "ended", endedAt: now, disconnectedAt: now, endedBy: admin.user.id,
        initiatedByUserId: null, initiatedByAdminId: admin.user.id, disconnectReason: reason, updatedAt: now,
      }).where(and(eq(couples.id, id), eq(couples.status, "active"))).returning({ id: couples.id });
      if (!ended) throw new HttpError(409, "이미 정리된 연결이에요");
      await tx.update(coupleMembers).set({ leftAt: now }).where(and(eq(coupleMembers.coupleId, id), isNull(coupleMembers.leftAt)));
      await tx.update(missions).set({ status: "cancelled", updatedAt: now }).where(and(
        eq(missions.coupleId, id), inArray(missions.status, ["scheduled", "sent"]), isNull(missions.deletedAt),
      ));
      await tx.update(dateMissionSchedules).set({ nextMissionAt: null, status: "cancelled", updatedAt: now }).where(eq(dateMissionSchedules.coupleId, id));
      await tx.insert(auditEvents).values({
        actorId: admin.user.id,
        action: "admin.couple_disconnected",
        entityType: "couple",
        entityId: id,
        metadata: { outcome: "success", failureCode: null, reason },
      });
    });
    const boss = await getBoss();
    await Promise.all(pendingJobs.flatMap((job) => job.jobId ? [boss.cancel(QUEUES.deliverMission, job.jobId).catch(() => undefined)] : []));
    await Promise.all(members.map((member) => sendUserNotification(member.id, {
      title: "기억 상자의 연결 상태가 바뀌었어요",
      body: "앱을 열어 확인해 주세요",
      url: "/settings/connection",
    })));
    return json({ ok: true });
  } catch (error) {
    await writeAdminAudit({ actorId: admin.user.id, action: "admin.couple_disconnect_failed", entityType: "couple", entityId: id, metadata: { outcome: "failure", failureCode: adminFailureCode(error), reason: auditReason } }).catch(() => undefined);
    throw error;
  }
});
