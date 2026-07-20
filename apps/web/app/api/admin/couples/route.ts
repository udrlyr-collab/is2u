import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { coupleInvitations, coupleMembers, coupleSettings, couples, dateEvents, memories, missions, users } from "@is2u/db/schema";
import { requireAdmin } from "../../../../lib/admin";
import { json, withApiErrors } from "../../../../lib/http";

export const GET = withApiErrors(async (request: Request) => {
  await requireAdmin(request);
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(30, Math.max(1, Number(url.searchParams.get("pageSize")) || 15));
  const status = url.searchParams.get("status") ?? "all";
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const db = getDb();
  const coupleRows = await db.select().from(couples).orderBy(desc(couples.createdAt));
  const coupleIds = coupleRows.map((row) => row.id);
  const members = coupleIds.length ? await db.select({ coupleId: coupleMembers.coupleId, joinedAt: coupleMembers.joinedAt, leftAt: coupleMembers.leftAt, userId: users.id, displayName: users.displayName, username: users.username }).from(coupleMembers).innerJoin(users, eq(coupleMembers.userId, users.id)).where(inArray(coupleMembers.coupleId, coupleIds)) : [];
  const settings = coupleIds.length ? await db.select({ coupleId: coupleSettings.coupleId, timezone: coupleSettings.timezone, weeklyMissionLimit: coupleSettings.weeklyMissionLimit, intervalMin: coupleSettings.missionIntervalMinMinutes, intervalMax: coupleSettings.missionIntervalMaxMinutes }).from(coupleSettings).where(inArray(coupleSettings.coupleId, coupleIds)) : [];
  const [dateCounts, memoryCounts, missionCounts] = coupleIds.length ? await Promise.all([
    db.select({ coupleId: dateEvents.coupleId, value: count() }).from(dateEvents).where(and(inArray(dateEvents.coupleId, coupleIds), eq(dateEvents.isTest, false), isNull(dateEvents.deletedAt))).groupBy(dateEvents.coupleId),
    db.select({ coupleId: memories.coupleId, value: count() }).from(memories).leftJoin(missions, eq(memories.missionId, missions.id)).where(and(inArray(memories.coupleId, coupleIds), isNull(memories.deletedAt), sql`${missions.isTest} IS DISTINCT FROM true`)).groupBy(memories.coupleId),
    db.select({ coupleId: missions.coupleId, value: count() }).from(missions).where(and(inArray(missions.coupleId, coupleIds), eq(missions.isTest, false), isNull(missions.deletedAt))).groupBy(missions.coupleId),
  ]) : [[], [], []];
  const relationshipRows = coupleRows.map((couple) => ({
    kind: "couple" as const, id: couple.id, status: couple.status, createdAt: couple.createdAt, startedAt: couple.startedAt, endedAt: couple.endedAt,
    members: members.filter((member) => member.coupleId === couple.id),
    settings: settings.find((item) => item.coupleId === couple.id) ?? null,
    counts: { dates: Number(dateCounts.find((item) => item.coupleId === couple.id)?.value ?? 0), memories: Number(memoryCounts.find((item) => item.coupleId === couple.id)?.value ?? 0), missions: Number(missionCounts.find((item) => item.coupleId === couple.id)?.value ?? 0) },
  }));
  const invitationRows = await db.select({ id: coupleInvitations.id, status: coupleInvitations.status, createdAt: coupleInvitations.createdAt, expiresAt: coupleInvitations.expiresAt, senderId: coupleInvitations.senderId, recipientId: coupleInvitations.recipientId }).from(coupleInvitations).orderBy(desc(coupleInvitations.createdAt));
  const inviteUserIds = [...new Set(invitationRows.flatMap((row) => [row.senderId, row.recipientId]))];
  const inviteUsers = inviteUserIds.length ? await db.select({ id: users.id, displayName: users.displayName, username: users.username }).from(users).where(inArray(users.id, inviteUserIds)) : [];
  const invitations = invitationRows.filter((row) => row.status !== "accepted").map((row) => ({ kind: "invitation" as const, ...row, members: [inviteUsers.find((user) => user.id === row.senderId), inviteUsers.find((user) => user.id === row.recipientId)].filter(Boolean) }));
  const merged = [...relationshipRows, ...invitations].filter((item) => {
    if (status === "active" && item.status !== "active") return false;
    if (status === "ended" && item.status !== "ended") return false;
    if (status === "pending" && item.status !== "pending") return false;
    return !q || item.members.some((member) => member && (`${member.displayName} ${member.username ?? ""}`).toLowerCase().includes(q));
  }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const total = merged.length;
  return json({ items: merged.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } });
});
