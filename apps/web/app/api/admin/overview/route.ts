import { and, count, desc, eq, gte, isNull, or } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { adminTestDispatches, coupleInvitations, coupleMembers, couples, dateEvents, memories, missions, users } from "@is2u/db/schema";
import { requireAdmin } from "../../../../lib/admin";
import { json, withApiErrors } from "../../../../lib/http";

export const GET = withApiErrors(async (request: Request) => {
  await requireAdmin(request);
  const db = getDb();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const [
    [accounts], [activeAccounts], [unpairedAccounts], [activeCouples], [pendingInvites],
    [endedCouples], [dateCount], [memoryCount], [newAccounts], [newMemories], recentTests,
  ] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(users).where(eq(users.accountStatus, "active")),
    db.select({ value: count() }).from(users).leftJoin(coupleMembers, and(eq(coupleMembers.userId, users.id), isNull(coupleMembers.leftAt))).where(and(eq(users.accountStatus, "active"), isNull(coupleMembers.userId))),
    db.select({ value: count() }).from(couples).where(eq(couples.status, "active")),
    db.select({ value: count() }).from(coupleInvitations).where(and(eq(coupleInvitations.status, "pending"), gte(coupleInvitations.expiresAt, new Date()))),
    db.select({ value: count() }).from(couples).where(eq(couples.status, "ended")),
    db.select({ value: count() }).from(dateEvents).where(and(eq(dateEvents.isTest, false), isNull(dateEvents.deletedAt))),
    db.select({ value: count() }).from(memories).leftJoin(missions, eq(memories.missionId, missions.id)).where(and(isNull(memories.deletedAt), eq(memories.pendingReplacement, false), or(isNull(missions.id), eq(missions.isTest, false)))),
    db.select({ value: count() }).from(users).where(gte(users.createdAt, since)),
    db.select({ value: count() }).from(memories).leftJoin(missions, eq(memories.missionId, missions.id)).where(and(gte(memories.createdAt, since), isNull(memories.deletedAt), eq(memories.pendingReplacement, false), or(isNull(missions.id), eq(missions.isTest, false)))),
    db.select({
      id: adminTestDispatches.id,
      createdAt: adminTestDispatches.createdAt,
      deliveryStatus: adminTestDispatches.deliveryStatus,
      missionId: missions.id,
      missionStatus: missions.status,
      templateId: missions.templateId,
      recipientName: users.displayName,
    }).from(adminTestDispatches)
      .innerJoin(missions, eq(adminTestDispatches.missionId, missions.id))
      .innerJoin(users, eq(adminTestDispatches.recipientId, users.id))
      .orderBy(desc(adminTestDispatches.createdAt)).limit(5),
  ]);
  return json({
    counts: {
      accounts: Number(accounts?.value ?? 0), activeAccounts: Number(activeAccounts?.value ?? 0), unpairedAccounts: Number(unpairedAccounts?.value ?? 0),
      activeCouples: Number(activeCouples?.value ?? 0), pendingInvites: Number(pendingInvites?.value ?? 0), endedCouples: Number(endedCouples?.value ?? 0),
      dates: Number(dateCount?.value ?? 0), memories: Number(memoryCount?.value ?? 0), newAccounts7d: Number(newAccounts?.value ?? 0), newMemories7d: Number(newMemories?.value ?? 0),
    },
    recentTests,
  });
});
