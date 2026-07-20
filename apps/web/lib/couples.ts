import { and, eq, isNull, lte, ne, or } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { coupleInvitations, coupleMembers, couples, users } from "@is2u/db/schema";
import { relationshipLabel } from "@is2u/core/types";
import { HttpError } from "./http";

export type CoupleUser = { id: string; displayName: string; username: string | null; gender: "male" | "female"; roleLabel: string };
export type ActiveCouple = { id: string; startedAt: Date; partner: CoupleUser };

export function invitationPairKey(firstUserId: string, secondUserId: string): string {
  return [firstUserId, secondUserId].sort().join(":");
}

export async function expirePendingInvitations(userId?: string): Promise<void> {
  const conditions = [eq(coupleInvitations.status, "pending"), lte(coupleInvitations.expiresAt, new Date())];
  if (userId) conditions.push(or(eq(coupleInvitations.senderId, userId), eq(coupleInvitations.recipientId, userId))!);
  await getDb().update(coupleInvitations).set({ status: "expired", respondedAt: new Date(), updatedAt: new Date() }).where(and(...conditions));
}

export async function getActiveCouple(userId: string): Promise<ActiveCouple | null> {
  const db = getDb();
  const [membership] = await db.select({ coupleId: coupleMembers.coupleId, startedAt: couples.startedAt })
    .from(coupleMembers)
    .innerJoin(couples, eq(coupleMembers.coupleId, couples.id))
    .where(and(eq(coupleMembers.userId, userId), isNull(coupleMembers.leftAt), eq(couples.status, "active")))
    .limit(1);
  if (!membership) return null;
  const [partner] = await db.select({ id: users.id, displayName: users.displayName, username: users.username, gender: users.gender })
    .from(coupleMembers)
    .innerJoin(users, eq(coupleMembers.userId, users.id))
    .where(and(eq(coupleMembers.coupleId, membership.coupleId), isNull(coupleMembers.leftAt), ne(coupleMembers.userId, userId)))
    .limit(1);
  if (!partner) return null;
  return { id: membership.coupleId, startedAt: membership.startedAt, partner: { ...partner, roleLabel: relationshipLabel(partner.gender) } };
}

export async function requireActiveCouple(userId: string): Promise<ActiveCouple> {
  const couple = await getActiveCouple(userId);
  if (!couple) throw new HttpError(409, "연결된 상대가 있어야 함께 쓰는 기능을 이용할 수 있어요");
  return couple;
}

export async function getAccessibleCoupleIds(userId: string): Promise<string[]> {
  const rows = await getDb().select({ coupleId: coupleMembers.coupleId }).from(coupleMembers).where(eq(coupleMembers.userId, userId));
  return rows.map((row) => row.coupleId);
}

export async function canAccessCouple(userId: string, coupleId: string | null): Promise<boolean> {
  if (!coupleId) return false;
  const [membership] = await getDb().select({ coupleId: coupleMembers.coupleId }).from(coupleMembers)
    .where(and(eq(coupleMembers.userId, userId), eq(coupleMembers.coupleId, coupleId))).limit(1);
  return Boolean(membership);
}

export async function requireActiveRecordCouple(userId: string, coupleId: string): Promise<ActiveCouple> {
  const active = await requireActiveCouple(userId);
  if (active.id !== coupleId) throw new HttpError(403, "지난 연결의 기록은 읽기만 할 수 있어요");
  return active;
}

export async function canAccessMemory(userId: string, memory: { createdBy: string; coupleId: string | null }): Promise<boolean> {
  if (!memory.coupleId) return memory.createdBy === userId;
  return canAccessCouple(userId, memory.coupleId);
}
