import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { coupleInvitations, coupleMembers, couples, users } from "@is2u/db/schema";
import { relationshipLabel } from "@is2u/core/types";
import { requireSession } from "../../../lib/auth";
import { expirePendingInvitations, getActiveCouple } from "../../../lib/couples";
import { json, withApiErrors } from "../../../lib/http";

export const GET = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await expirePendingInvitations(session.user.id);
  const db = getDb();
  const invitations = await db.select().from(coupleInvitations).where(or(
    eq(coupleInvitations.senderId, session.user.id),
    eq(coupleInvitations.recipientId, session.user.id),
  )).orderBy(desc(coupleInvitations.createdAt)).limit(40);
  const userIds = [...new Set(invitations.flatMap((invitation) => [invitation.senderId, invitation.recipientId]))];
  const people = userIds.length ? await db.select({ id: users.id, displayName: users.displayName, username: users.username, gender: users.gender }).from(users).where(inArray(users.id, userIds)) : [];
  const person = (id: string) => {
    const found = people.find((candidate) => candidate.id === id);
    return found?.username ? { ...found, username: found.username, roleLabel: relationshipLabel(found.gender) } : null;
  };
  const publicInvitations = invitations.map((invitation) => ({
    id: invitation.id,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    sender: person(invitation.senderId),
    recipient: person(invitation.recipientId),
  }));
  const activeCouple = await getActiveCouple(session.user.id);
  const [latestEndedCouple] = activeCouple ? [] : await db.select({
    id: couples.id,
    startedAt: couples.startedAt,
    disconnectedAt: couples.disconnectedAt,
    endedAt: couples.endedAt,
  }).from(coupleMembers).innerJoin(couples, eq(coupleMembers.coupleId, couples.id))
    .where(and(eq(coupleMembers.userId, session.user.id), eq(couples.status, "ended")))
    .orderBy(desc(couples.endedAt)).limit(1);
  return json({
    user: session.user,
    activeCouple,
    latestEndedCouple: latestEndedCouple ?? null,
    incoming: publicInvitations.filter((invitation) => invitation.recipient?.id === session.user.id),
    outgoing: publicInvitations.filter((invitation) => invitation.sender?.id === session.user.id),
  });
});
