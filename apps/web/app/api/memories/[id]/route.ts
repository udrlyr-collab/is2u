import { and, eq } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, memories } from "@is2u/db/schema";
import { requireCsrf, requireSession } from "../../../../lib/auth";
import { HttpError, json, withApiErrors } from "../../../../lib/http";

type Context = { params: Promise<{ id: string }> };

export const DELETE = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const now = new Date();
  const [memory] = await getDb().update(memories).set({ deletedAt: now, purgeAfter: new Date(now.getTime() + 30 * 24 * 60 * 60_000) }).where(and(eq(memories.id, id), eq(memories.createdBy, session.user.id))).returning();
  if (!memory) throw new HttpError(404, "기억을 찾을 수 없습니다.");
  await getDb().insert(auditEvents).values({ actorId: session.user.id, action: "memory.soft_deleted", entityType: "memory", entityId: id });
  return json({ memory });
});

export const PATCH = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const [memory] = await getDb().update(memories).set({ deletedAt: null, purgeAfter: null }).where(and(eq(memories.id, id), eq(memories.createdBy, session.user.id))).returning();
  if (!memory) throw new HttpError(404, "기억을 찾을 수 없습니다.");
  await getDb().insert(auditEvents).values({ actorId: session.user.id, action: "memory.restored", entityType: "memory", entityId: id });
  return json({ memory });
});
