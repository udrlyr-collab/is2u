import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, dateEvents } from "@is2u/db/schema";
import { dateEventSchema } from "@is2u/core/validation";
import { requireCsrf, requireSession } from "../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../lib/http";
import { cancelScheduledMission, scheduleMissionForDate } from "../../../../lib/scheduler";

type Context = { params: Promise<{ id: string }> };

export const GET = withApiErrors(async (request: Request, context: Context) => {
  await requireSession(request);
  const { id } = await context.params;
  const [event] = await getDb().select().from(dateEvents).where(and(eq(dateEvents.id, id), eq(dateEvents.isTest, false), isNull(dateEvents.deletedAt))).limit(1);
  if (!event) throw new HttpError(404, "일정을 찾을 수 없습니다.");
  return json({ dateEvent: event });
});

export const PATCH = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const input = dateEventSchema.parse(await readJson(request));
  const [existing] = await getDb().select().from(dateEvents).where(and(eq(dateEvents.id, id), eq(dateEvents.isTest, false), isNull(dateEvents.deletedAt))).limit(1);
  if (!existing) throw new HttpError(404, "일정을 찾을 수 없습니다.");
  if (existing.status === "cancelled") throw new HttpError(409, "취소된 약속은 수정할 수 없어요.");
  await cancelScheduledMission(id);
  const now = new Date();
  const status = now < input.startAt ? "scheduled" : now <= input.endAt ? "active" : "completed";
  const [updated] = await getDb().update(dateEvents).set({ ...input, title: input.title || null, note: input.note || null, status, cancelledAt: null, updatedAt: now }).where(eq(dateEvents.id, id)).returning();
  await getDb().insert(auditEvents).values({ actorId: session.user.id, action: "date_event.updated", entityType: "date_event", entityId: id });
  if (updated.status === "active") await scheduleMissionForDate(id);
  return json({ dateEvent: updated });
});

export const DELETE = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  await cancelScheduledMission(id);
  const [updated] = await getDb().update(dateEvents).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(dateEvents.id, id), eq(dateEvents.isTest, false), isNull(dateEvents.deletedAt))).returning();
  if (!updated) throw new HttpError(404, "일정을 찾을 수 없습니다.");
  await getDb().insert(auditEvents).values({ actorId: session.user.id, action: "date_event.deleted", entityType: "date_event", entityId: id });
  return json({ ok: true });
});
