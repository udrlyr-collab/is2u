import { and, asc, count, desc, eq, exists, ilike, inArray, isNull, notExists, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { coupleMembers, couples, dateEvents, memories, missions, users } from "@is2u/db/schema";
import { requireAdmin } from "../../../../lib/admin";
import { json, withApiErrors } from "../../../../lib/http";

function intParam(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

export const GET = withApiErrors(async (request: Request) => {
  await requireAdmin(request);
  const url = new URL(request.url);
  const page = intParam(url.searchParams.get("page"), 1, 100_000);
  const pageSize = intParam(url.searchParams.get("pageSize"), 20, 50);
  const query = url.searchParams.get("q")?.trim().slice(0, 50) ?? "";
  const role = url.searchParams.get("role");
  const status = url.searchParams.get("status");
  const connection = url.searchParams.get("connection");
  const sort = url.searchParams.get("sort") ?? "newest";
  const db = getDb();
  const conditions: SQL[] = [];
  if (query) conditions.push(or(eq(users.username, query.toLowerCase()), ilike(users.displayName, `%${query}%`), ...(/^[0-9a-f-]{36}$/i.test(query) ? [eq(users.id, query)] : []))!);
  if (role === "admin" || role === "user") conditions.push(eq(users.role, role));
  if (status === "active" || status === "suspended" || status === "pending_deletion" || status === "deleted") conditions.push(eq(users.accountStatus, status));
  else if (status !== "all") conditions.push(sql`${users.accountStatus} <> 'deleted'`);
  const activeMembership = db.select({ value: coupleMembers.userId }).from(coupleMembers).innerJoin(couples, eq(coupleMembers.coupleId, couples.id)).where(and(eq(coupleMembers.userId, users.id), isNull(coupleMembers.leftAt), eq(couples.status, "active")));
  if (connection === "connected") conditions.push(exists(activeMembership));
  if (connection === "unpaired") conditions.push(notExists(activeMembership));
  const where = and(...conditions);
  const memoryCountExpression = sql<number>`(SELECT count(*)::int FROM ${memories} admin_memory LEFT JOIN ${missions} admin_memory_mission ON admin_memory.mission_id = admin_memory_mission.id WHERE admin_memory.created_by = "users"."id" AND admin_memory.deleted_at IS NULL AND admin_memory_mission.is_test IS DISTINCT FROM true)`;
  const missionCountExpression = sql<number>`(SELECT count(*)::int FROM ${missions} admin_user_mission WHERE admin_user_mission.recipient_id = "users"."id" AND admin_user_mission.is_test = false AND admin_user_mission.deleted_at IS NULL)`;
  const dateCountExpression = sql<number>`(SELECT count(*)::int FROM ${dateEvents} admin_user_date WHERE admin_user_date.created_by = "users"."id" AND admin_user_date.is_test = false AND admin_user_date.deleted_at IS NULL)`;
  const order = sort === "oldest" ? asc(users.createdAt) : sort === "name" ? asc(users.displayName) : sort === "username" ? asc(users.username) : sort === "last-login" ? desc(users.lastLoginAt) : sort === "memories" ? desc(memoryCountExpression) : sort === "missions" ? desc(missionCountExpression) : desc(users.createdAt);
  const [[totalRow], rows] = await Promise.all([
    db.select({ value: count() }).from(users).where(where),
    db.select({ id: users.id, displayName: users.displayName, username: users.username, gender: users.gender, role: users.role, accountStatus: users.accountStatus, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt, memoryCount: memoryCountExpression, missionCount: missionCountExpression, dateCount: dateCountExpression })
      .from(users).where(where).orderBy(order).limit(pageSize).offset((page - 1) * pageSize),
  ]);
  const ids = rows.map((row) => row.id);
  const memberships = ids.length ? await db.select({ userId: coupleMembers.userId, coupleId: coupleMembers.coupleId }).from(coupleMembers).innerJoin(couples, and(eq(coupleMembers.coupleId, couples.id), eq(couples.status, "active"))).where(and(inArray(coupleMembers.userId, ids), isNull(coupleMembers.leftAt))) : [];
  const coupleIds = memberships.map((row) => row.coupleId);
  const partners = coupleIds.length ? await db.select({ coupleId: coupleMembers.coupleId, id: users.id, displayName: users.displayName, username: users.username }).from(coupleMembers).innerJoin(users, eq(coupleMembers.userId, users.id)).where(and(inArray(coupleMembers.coupleId, coupleIds), isNull(coupleMembers.leftAt))) : [];
  const items = rows.map((row) => {
    const membership = memberships.find((item) => item.userId === row.id);
    const partner = membership ? partners.find((item) => item.coupleId === membership.coupleId && item.id !== row.id) ?? null : null;
    return { ...row, coupleId: membership?.coupleId ?? null, partner, memoryCount: Number(row.memoryCount), missionCount: Number(row.missionCount), dateCount: Number(row.dateCount) };
  });
  const total = Number(totalRow?.value ?? 0);
  return json({ items, pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } });
});
