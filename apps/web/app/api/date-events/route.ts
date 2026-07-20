import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, dateEvents } from "@is2u/db/schema";
import { dateEventCreateSchema } from "@is2u/core/validation";
import { requireCsrf, requireSession } from "../../../lib/auth";
import { json, readJson, withApiErrors } from "../../../lib/http";
import { getAccessibleCoupleIds, getActiveCouple, requireActiveCouple } from "../../../lib/couples";
import { scheduleMissionForDate } from "../../../lib/scheduler";

function currentStatus(startAt: Date, endAt: Date) {
  const now = new Date();
  if (now < startAt) return "scheduled" as const;
  if (now <= endAt) return "active" as const;
  return "completed" as const;
}

export const GET = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  const db = getDb();
  const coupleIds = await getAccessibleCoupleIds(session.user.id);
  const activeCouple = await getActiveCouple(session.user.id);
  if (!coupleIds.length) return json({ dateEvents: [], activeCouple: null });
  const rows = await db.select().from(dateEvents).where(and(inArray(dateEvents.coupleId, coupleIds), eq(dateEvents.isTest, false), isNull(dateEvents.deletedAt))).orderBy(asc(dateEvents.startAt));
  const changed = rows.filter((row) => row.status !== "cancelled" && row.status !== currentStatus(row.startAt, row.endAt));
  await Promise.all(changed.map((row) => db.update(dateEvents).set({ status: currentStatus(row.startAt, row.endAt), updatedAt: new Date() }).where(eq(dateEvents.id, row.id))));
  return json({ activeCouple, dateEvents: rows.map((row) => ({ ...row, status: row.status === "cancelled" ? row.status : currentStatus(row.startAt, row.endAt) })) });
});

export const POST = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const input = dateEventCreateSchema.parse(await readJson(request));
  const activeCouple = await requireActiveCouple(session.user.id);
  const db = getDb();
  const [created] = await db.insert(dateEvents).values({
    coupleId: activeCouple.id,
    startAt: input.startAt,
    endAt: input.endAt,
    title: input.title || null,
    note: input.note || null,
    status: currentStatus(input.startAt, input.endAt),
    isTest: false,
    clientRequestId: input.clientRequestId,
    createdBy: session.user.id,
  }).onConflictDoNothing({ target: dateEvents.clientRequestId }).returning();

  const resolved = created ?? (await db.select().from(dateEvents).where(and(eq(dateEvents.clientRequestId, input.clientRequestId), eq(dateEvents.coupleId, activeCouple.id))).limit(1))[0];
  if (!resolved) throw new Error("일정 저장 결과를 확인하지 못했습니다.");

  if (created) {
    await db.insert(auditEvents).values({ actorId: session.user.id, action: "date_event.created", entityType: "date_event", entityId: created.id });
    if (created.status === "active" || created.status === "scheduled") await scheduleMissionForDate(created.id);
  }
  return json({ dateEvent: resolved, reused: !created }, created ? 201 : 200);
});
