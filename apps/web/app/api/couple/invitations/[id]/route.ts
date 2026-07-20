import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, coupleInvitations, coupleMembers, coupleSettings, couples } from "@is2u/db/schema";
import { coupleInvitationActionSchema } from "@is2u/core/validation";
import { requireCsrf, requireSession } from "../../../../../lib/auth";
import { expirePendingInvitations, getActiveCouple } from "../../../../../lib/couples";
import { HttpError, json, readJson, withApiErrors } from "../../../../../lib/http";
import { sendUserNotification } from "../../../../../lib/push";

type Context = { params: Promise<{ id: string }> };

export const POST = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const { action } = coupleInvitationActionSchema.parse(await readJson(request));
  await expirePendingInvitations(session.user.id);
  const db = getDb();
  const [invitation] = await db.select().from(coupleInvitations).where(eq(coupleInvitations.id, id)).limit(1);
  if (!invitation || invitation.status !== "pending") throw new HttpError(404, "기다리는 초대를 찾을 수 없어요");
  if (action === "cancel") {
    if (invitation.senderId !== session.user.id) throw new HttpError(403, "이 초대를 취소할 수 없어요");
    await db.update(coupleInvitations).set({ status: "cancelled", respondedAt: new Date(), updatedAt: new Date() }).where(and(eq(coupleInvitations.id, id), eq(coupleInvitations.status, "pending")));
    await db.insert(auditEvents).values({ actorId: session.user.id, action: "couple_invitation.cancelled", entityType: "couple_invitation", entityId: id });
    return json({ ok: true });
  }
  if (invitation.recipientId !== session.user.id) throw new HttpError(403, "이 초대에 답할 수 없어요");
  if (action === "decline") {
    await db.update(coupleInvitations).set({ status: "declined", respondedAt: new Date(), updatedAt: new Date() }).where(and(eq(coupleInvitations.id, id), eq(coupleInvitations.status, "pending")));
    await db.insert(auditEvents).values({ actorId: session.user.id, action: "couple_invitation.declined", entityType: "couple_invitation", entityId: id });
    return json({ ok: true });
  }
  if (await getActiveCouple(invitation.senderId) || await getActiveCouple(invitation.recipientId)) throw new HttpError(409, "한쪽 계정이 이미 다른 상대와 연결되어 있어요");
  let coupleId: string;
  try {
    coupleId = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from couple_invitations where id = ${id} and status = 'pending' for update`);
      const [locked] = await tx.select().from(coupleInvitations).where(and(eq(coupleInvitations.id, id), eq(coupleInvitations.status, "pending"))).limit(1);
      if (!locked) throw new HttpError(409, "이미 처리된 초대예요");
      const activeMembership = await tx.select({ userId: coupleMembers.userId }).from(coupleMembers).where(and(
        isNull(coupleMembers.leftAt),
        or(eq(coupleMembers.userId, locked.senderId), eq(coupleMembers.userId, locked.recipientId)),
      )).limit(1);
      if (activeMembership.length) throw new HttpError(409, "한쪽 계정이 이미 다른 상대와 연결되어 있어요");
      const [couple] = await tx.insert(couples).values({}).returning({ id: couples.id });
      await tx.insert(coupleMembers).values([{ coupleId: couple.id, userId: locked.senderId }, { coupleId: couple.id, userId: locked.recipientId }]);
      await tx.insert(coupleSettings).values({ coupleId: couple.id });
      const now = new Date();
      await tx.update(coupleInvitations).set({ status: "accepted", respondedAt: now, updatedAt: now }).where(eq(coupleInvitations.id, id));
      await tx.update(coupleInvitations).set({ status: "cancelled", respondedAt: now, updatedAt: now }).where(and(
        eq(coupleInvitations.status, "pending"),
        ne(coupleInvitations.id, id),
        or(
          eq(coupleInvitations.senderId, locked.senderId), eq(coupleInvitations.recipientId, locked.senderId),
          eq(coupleInvitations.senderId, locked.recipientId), eq(coupleInvitations.recipientId, locked.recipientId),
        ),
      ));
      await tx.insert(auditEvents).values({ actorId: session.user.id, action: "couple.connected", entityType: "couple", entityId: couple.id });
      return couple.id;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new HttpError(409, "한쪽 계정이 이미 다른 상대와 연결되어 있어요");
    throw error;
  }
  await sendUserNotification(invitation.senderId, { title: "연결 상태가 바뀌었어요", body: "설정에서 현재 연결을 확인해 주세요", url: "/settings#connection" });
  return json({ coupleId, message: "서로의 추억 상자가 연결됐어요" });
});
