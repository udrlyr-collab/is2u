import { and, count, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, coupleInvitations, coupleMembers, couples, dateMissionSchedules, missions, users } from "@is2u/db/schema";
import { coupleDisconnectSchema } from "@is2u/core/validation";
import { requireCsrf, requireSession, verifyPassword } from "../../../../lib/auth";
import { getActiveCouple } from "../../../../lib/couples";
import { HttpError, json, readJson, withApiErrors } from "../../../../lib/http";
import { sendUserNotification } from "../../../../lib/push";
import { getBoss, QUEUES } from "../../../../lib/queue";

const RATE_LIMIT_WINDOW_MS = 15 * 60_000;
const RATE_LIMIT_ATTEMPTS = 5;

export const POST = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const input = coupleDisconnectSchema.parse(await readJson(request));
  const db = getDb();
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const [recent] = await db.select({ value: count() }).from(auditEvents).where(and(
    eq(auditEvents.actorId, session.user.id),
    eq(auditEvents.action, "couple.disconnect_attempt"),
    gte(auditEvents.createdAt, since),
  ));
  if (Number(recent?.value ?? 0) >= RATE_LIMIT_ATTEMPTS) throw new HttpError(429, "잠시 뒤 다시 시도해 주세요");

  const [account] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, session.user.id)).limit(1);
  const passwordOk = await verifyPassword(account?.passwordHash, input.password);
  await db.insert(auditEvents).values({
    actorId: session.user.id,
    action: "couple.disconnect_attempt",
    entityType: "couple",
    metadata: { outcome: passwordOk ? "verified" : "denied", failureCode: passwordOk ? null : "invalid_password" },
  });
  if (!passwordOk) throw new HttpError(401, "비밀번호를 확인해 주세요");

  const active = await getActiveCouple(session.user.id);
  if (!active) {
    const [latestEnded] = await db.select({ id: couples.id }).from(coupleMembers)
      .innerJoin(couples, eq(coupleMembers.coupleId, couples.id))
      .where(and(eq(coupleMembers.userId, session.user.id), eq(couples.status, "ended")))
      .orderBy(desc(couples.endedAt)).limit(1);
    if (latestEnded) return json({ ok: true, alreadyDisconnected: true, message: "함께 쓰던 공간을 정리했어요" });
    throw new HttpError(409, "정리할 연결이 없어요");
  }

  const pendingJobs = await db.select({ jobId: missions.jobId }).from(missions).where(and(
    eq(missions.coupleId, active.id), inArray(missions.status, ["scheduled", "sent"]), isNull(missions.deletedAt),
  ));
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from couples where id = ${active.id} and status = 'active' for update`);
    const [ended] = await tx.update(couples).set({
      status: "ended",
      endedAt: now,
      disconnectedAt: now,
      endedBy: session.user.id,
      initiatedByUserId: session.user.id,
      initiatedByAdminId: null,
      disconnectReason: "user_request",
      updatedAt: now,
    }).where(and(eq(couples.id, active.id), eq(couples.status, "active"))).returning({ id: couples.id });
    if (!ended) throw new HttpError(409, "이미 정리된 연결이에요");
    await tx.update(coupleMembers).set({ leftAt: now }).where(and(eq(coupleMembers.coupleId, active.id), isNull(coupleMembers.leftAt)));
    await tx.update(missions).set({ status: "cancelled", updatedAt: now }).where(and(
      eq(missions.coupleId, active.id), inArray(missions.status, ["scheduled", "sent"]), isNull(missions.deletedAt),
    ));
    await tx.update(dateMissionSchedules).set({ nextMissionAt: null, status: "cancelled", updatedAt: now }).where(eq(dateMissionSchedules.coupleId, active.id));
    await tx.update(coupleInvitations).set({ status: "cancelled", respondedAt: now, updatedAt: now }).where(and(
      eq(coupleInvitations.status, "pending"),
      or(
        eq(coupleInvitations.senderId, session.user.id), eq(coupleInvitations.recipientId, session.user.id),
        eq(coupleInvitations.senderId, active.partner.id), eq(coupleInvitations.recipientId, active.partner.id),
      ),
    ));
    await tx.insert(auditEvents).values({
      actorId: session.user.id,
      action: "couple.disconnected",
      entityType: "couple",
      entityId: active.id,
      metadata: { initiatedBy: "user", outcome: "success", reason: "user_request" },
    });
  });

  const boss = await getBoss();
  await Promise.all(pendingJobs.flatMap((job) => job.jobId ? [boss.cancel(QUEUES.deliverMission, job.jobId).catch(() => undefined)] : []));
  await sendUserNotification(active.partner.id, {
    title: "기억 상자의 연결 상태가 바뀌었어요",
    body: "앱을 열면 자세히 확인할 수 있어요",
    url: "/settings/connection",
  });
  return json({ ok: true, message: "함께 쓰던 공간을 정리했어요" });
});
