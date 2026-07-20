import { and, count, desc, eq, ilike } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, users } from "@is2u/db/schema";
import { requireAdmin } from "../../../../lib/admin";
import { json, withApiErrors } from "../../../../lib/http";

export const GET = withApiErrors(async (request: Request) => {
  await requireAdmin(request);
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize")) || 20));
  const action = url.searchParams.get("action")?.trim();
  const where = action ? and(ilike(auditEvents.action, "admin.%"), eq(auditEvents.action, action)) : ilike(auditEvents.action, "admin.%");
  const db = getDb();
  const [[totalRow], items] = await Promise.all([
    db.select({ value: count() }).from(auditEvents).where(where),
    db.select({ id: auditEvents.id, action: auditEvents.action, entityType: auditEvents.entityType, entityId: auditEvents.entityId, metadata: auditEvents.metadata, createdAt: auditEvents.createdAt, actor: { id: users.id, displayName: users.displayName, username: users.username } }).from(auditEvents).leftJoin(users, eq(auditEvents.actorId, users.id)).where(where).orderBy(desc(auditEvents.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
  ]);
  const total = Number(totalRow?.value ?? 0);
  return json({ items, pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } });
});
