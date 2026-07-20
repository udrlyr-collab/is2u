import { and, count, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, coupleInvitations, coupleMembers, couples, dateEvents, dateMissionSchedules, memories, missions, pushSubscriptions, sessions, users } from "@is2u/db/schema";
import { adminUserActionSchema } from "@is2u/core/validation";
import { adminFailureCode, requireAdmin, writeAdminAudit } from "../../../../../lib/admin";
import { requireCsrf } from "../../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../../lib/http";
import { sendUserNotification } from "../../../../../lib/push";
import { getBoss, QUEUES } from "../../../../../lib/queue";

export const GET = withApiErrors(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await requireAdmin(request);
  const { id } = await context.params;
  const db = getDb();
  const [user] = await db.select({ id: users.id, displayName: users.displayName, username: users.username, gender: users.gender, role: users.role, accountStatus: users.accountStatus, createdAt: users.createdAt, updatedAt: users.updatedAt, lastLoginAt: users.lastLoginAt }).from(users).where(eq(users.id, id)).limit(1);
  if (!user) throw new HttpError(404, "계정을 찾을 수 없어요");
  const [membership] = await db.select({ coupleId: coupleMembers.coupleId, joinedAt: coupleMembers.joinedAt }).from(coupleMembers).innerJoin(couples, and(eq(coupleMembers.coupleId, couples.id), eq(couples.status, "active"))).where(and(eq(coupleMembers.userId, id), isNull(coupleMembers.leftAt))).limit(1);
  const [partner] = membership ? await db.select({ id: users.id, displayName: users.displayName, username: users.username }).from(coupleMembers).innerJoin(users, eq(coupleMembers.userId, users.id)).where(and(eq(coupleMembers.coupleId, membership.coupleId), isNull(coupleMembers.leftAt))).then((rows) => rows.filter((row) => row.id !== id).slice(0, 1)) : [];
  const [[dates], [memoryCount], [missionCount], [inviteCount], [pushCount]] = await Promise.all([
    db.select({ value: count() }).from(dateEvents).where(and(eq(dateEvents.createdBy, id), eq(dateEvents.isTest, false), isNull(dateEvents.deletedAt))),
    db.select({ value: count() }).from(memories).leftJoin(missions, eq(memories.missionId, missions.id)).where(and(eq(memories.createdBy, id), isNull(memories.deletedAt), sql`${missions.isTest} IS DISTINCT FROM true`)),
    db.select({ value: count() }).from(missions).where(and(eq(missions.recipientId, id), eq(missions.isTest, false), isNull(missions.deletedAt))),
    db.select({ value: count() }).from(coupleInvitations).where(or(eq(coupleInvitations.senderId, id), eq(coupleInvitations.recipientId, id))),
    db.select({ value: count() }).from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, id), isNull(pushSubscriptions.invalidatedAt))),
  ]);
  return json({ user, relationship: membership ? { ...membership, partner: partner ?? null } : null, counts: { dates: Number(dates?.value ?? 0), memories: Number(memoryCount?.value ?? 0), missions: Number(missionCount?.value ?? 0), invitations: Number(inviteCount?.value ?? 0), activePushSubscriptions: Number(pushCount?.value ?? 0) } });
});

export const POST = withApiErrors(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(request);
  await requireCsrf(request, admin);
  const { id } = await context.params;
  let action = "unknown";
  try {
    const input = adminUserActionSchema.parse(await readJson(request));
    action = input.action;
    if ((input.action === "suspend" || input.action === "delete") && id === admin.user.id) throw new HttpError(409, "현재 로그인한 관리자 계정에는 이 작업을 할 수 없어요");
    const db = getDb();
    const [target] = await db.select({ id: users.id, username: users.username, status: users.accountStatus }).from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw new HttpError(404, "계정을 찾을 수 없어요");

    if (input.action === "clear-invitations") {
      if (target.status === "deleted") throw new HttpError(409, "삭제된 계정에는 작업할 수 없어요");
      const cleared = await db.update(coupleInvitations).set({ status: "cancelled", respondedAt: new Date(), updatedAt: new Date() }).where(and(eq(coupleInvitations.status, "pending"), or(eq(coupleInvitations.senderId, id), eq(coupleInvitations.recipientId, id)))).returning({ id: coupleInvitations.id });
      await writeAdminAudit({ actorId: admin.user.id, action: "admin.invitation_cleanup", entityType: "user", entityId: id, metadata: { count: cleared.length, outcome: "success", failureCode: null } });
      return json({ ok: true, cleared: cleared.length });
    }

    if (input.action === "delete") {
      if (!target.username || input.username !== target.username) throw new HttpError(400, "삭제할 계정의 아이디를 정확히 입력해 주세요");
      if (target.status === "deleted") return json({ ok: true, accountStatus: "deleted", alreadyDeleted: true });
      const [membership] = await db.select({ coupleId: couples.id }).from(coupleMembers)
        .innerJoin(couples, and(eq(coupleMembers.coupleId, couples.id), eq(couples.status, "active")))
        .where(and(eq(coupleMembers.userId, id), isNull(coupleMembers.leftAt))).limit(1);
      const [partner] = membership ? await db.select({ id: users.id }).from(coupleMembers).innerJoin(users, eq(coupleMembers.userId, users.id))
        .where(and(eq(coupleMembers.coupleId, membership.coupleId), isNull(coupleMembers.leftAt), sql`${users.id} <> ${id}`)).limit(1) : [];
      const cancellable = membership
        ? and(or(eq(missions.coupleId, membership.coupleId), eq(missions.recipientId, id)), inArray(missions.status, ["scheduled", "sent"]), isNull(missions.deletedAt))
        : and(eq(missions.recipientId, id), inArray(missions.status, ["scheduled", "sent"]), isNull(missions.deletedAt));
      const pendingJobs = await db.select({ jobId: missions.jobId }).from(missions).where(cancellable);
      const now = new Date();
      await db.transaction(async (tx) => {
        await tx.execute(sql`select id from users where id = ${id} for update`);
        if (membership) {
          await tx.update(couples).set({
            status: "ended", endedAt: now, disconnectedAt: now, endedBy: admin.user.id,
            initiatedByUserId: null, initiatedByAdminId: admin.user.id, disconnectReason: "account_deletion", updatedAt: now,
          }).where(and(eq(couples.id, membership.coupleId), eq(couples.status, "active")));
          await tx.update(coupleMembers).set({ leftAt: now }).where(and(eq(coupleMembers.coupleId, membership.coupleId), isNull(coupleMembers.leftAt)));
          await tx.update(dateMissionSchedules).set({ nextMissionAt: null, status: "cancelled", updatedAt: now }).where(eq(dateMissionSchedules.coupleId, membership.coupleId));
        }
        await tx.update(missions).set({ status: "cancelled", updatedAt: now }).where(cancellable);
        await tx.update(coupleInvitations).set({ status: "cancelled", respondedAt: now, updatedAt: now }).where(and(
          eq(coupleInvitations.status, "pending"), or(eq(coupleInvitations.senderId, id), eq(coupleInvitations.recipientId, id)),
        ));
        await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)));
        await tx.update(pushSubscriptions).set({ invalidatedAt: now, updatedAt: now }).where(and(eq(pushSubscriptions.userId, id), isNull(pushSubscriptions.invalidatedAt)));
        await tx.update(users).set({ accountStatus: "deleted", deletedAt: now, updatedAt: now }).where(eq(users.id, id));
        await tx.insert(auditEvents).values({
          actorId: admin.user.id,
          action: "admin.user_deleted",
          entityType: "user",
          entityId: id,
          metadata: { outcome: "success", failureCode: null, disconnectedCouple: Boolean(membership), reason: "account_deletion" },
        });
        if (membership) await tx.insert(auditEvents).values({
          actorId: admin.user.id,
          action: "admin.couple_disconnected",
          entityType: "couple",
          entityId: membership.coupleId,
          metadata: { outcome: "success", failureCode: null, reason: "account_deletion" },
        });
      });
      const boss = await getBoss();
      await Promise.all(pendingJobs.flatMap((job) => job.jobId ? [boss.cancel(QUEUES.deliverMission, job.jobId).catch(() => undefined)] : []));
      if (partner) await sendUserNotification(partner.id, { title: "기억 상자의 연결 상태가 바뀌었어요", body: "앱을 열어 확인해 주세요", url: "/settings/connection" });
      return json({ ok: true, accountStatus: "deleted" });
    }

    if (target.status === "deleted") throw new HttpError(409, "삭제된 계정에는 작업할 수 없어요");
    const nextStatus = input.action === "suspend" ? "suspended" : "active";
    await db.transaction(async (tx) => {
      await tx.update(users).set({ accountStatus: nextStatus, updatedAt: new Date() }).where(eq(users.id, id));
      if (nextStatus === "suspended") await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)));
      await tx.insert(auditEvents).values({ actorId: admin.user.id, action: nextStatus === "suspended" ? "admin.user_suspended" : "admin.user_activated", entityType: "user", entityId: id, metadata: { outcome: "success", failureCode: null } });
    });
    return json({ ok: true, accountStatus: nextStatus });
  } catch (error) {
    await writeAdminAudit({ actorId: admin.user.id, action: `admin.${action}_failed`, entityType: "user", entityId: id, metadata: { outcome: "failure", failureCode: adminFailureCode(error), reason: action === "delete" ? "account_deletion" : action } }).catch(() => undefined);
    throw error;
  }
});
