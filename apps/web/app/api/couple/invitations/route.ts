import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, coupleInvitations, users } from "@is2u/db/schema";
import { coupleInvitationCreateSchema } from "@is2u/core/validation";
import { requireCsrf, requireSession } from "../../../../lib/auth";
import { expirePendingInvitations, getActiveCouple, invitationPairKey } from "../../../../lib/couples";
import { HttpError, json, readJson, withApiErrors } from "../../../../lib/http";
import { sendUserNotification } from "../../../../lib/push";

const INVITE_ERROR = "초대를 보낼 수 없어요 아이디와 연결 상태를 확인해 주세요";

export const POST = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const input = coupleInvitationCreateSchema.parse(await readJson(request));
  const db = getDb();
  await expirePendingInvitations(session.user.id);
  if (await getActiveCouple(session.user.id)) throw new HttpError(409, "이미 연결된 상대가 있어요");
  const since = new Date(Date.now() - 60 * 60_000);
  const [recent] = await db.select({ value: count() }).from(coupleInvitations).where(and(eq(coupleInvitations.senderId, session.user.id), gte(coupleInvitations.createdAt, since)));
  if (Number(recent?.value ?? 0) >= 5) throw new HttpError(429, "초대는 잠시 뒤 다시 보낼 수 있어요");
  const [recipient] = await db.select({ id: users.id, username: users.username, accountStatus: users.accountStatus }).from(users).where(eq(users.username, input.username)).limit(1);
  if (!recipient?.username || recipient.accountStatus !== "active" || recipient.id === session.user.id || await getActiveCouple(recipient.id)) throw new HttpError(409, INVITE_ERROR);
  const now = new Date();
  let invitation: { id: string };
  try {
    [invitation] = await db.insert(coupleInvitations).values({
      senderId: session.user.id,
      recipientId: recipient.id,
      pairKey: invitationPairKey(session.user.id, recipient.id),
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60_000),
    }).returning({ id: coupleInvitations.id });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new HttpError(409, "이미 기다리는 초대가 있어요");
    throw error;
  }
  await db.insert(auditEvents).values({ actorId: session.user.id, action: "couple_invitation.created", entityType: "couple_invitation", entityId: invitation.id });
  await sendUserNotification(recipient.id, { title: "새 연결 초대가 도착했어요", body: "설정에서 보낸 사람을 확인해 주세요", url: "/settings#connection" });
  return json({ invitationId: invitation.id, message: "초대를 보냈어요" }, 201);
});
