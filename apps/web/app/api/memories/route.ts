import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, dateEvents, memories } from "@is2u/db/schema";
import { manualMemoryCreateSchema } from "@is2u/core/validation";
import { requireCsrf, requireSession } from "../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../lib/http";

export const POST = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const raw = await readJson(request);
  const input = manualMemoryCreateSchema.parse(raw);
  const db = getDb();

  const [existing] = await db.select().from(memories).where(eq(memories.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existing) {
    if (existing.createdBy !== session.user.id || existing.missionId) throw new HttpError(409, "이미 사용한 저장 요청이에요");
    return json({ memory: existing, reused: true });
  }

  let dateEventId = input.dateEventId ?? null;
  if (dateEventId) {
    const [event] = await db.select({ id: dateEvents.id }).from(dateEvents).where(and(
      eq(dateEvents.id, dateEventId),
      eq(dateEvents.isTest, false),
      isNull(dateEvents.deletedAt),
    )).limit(1);
    if (!event) throw new HttpError(404, "연결할 약속을 찾을 수 없어요");
  } else if (!("dateEventId" in (raw as Record<string, unknown>))) {
    const now = new Date();
    const active = await db.select({ id: dateEvents.id }).from(dateEvents).where(and(
      eq(dateEvents.isTest, false), isNull(dateEvents.deletedAt), lt(dateEvents.startAt, now), gt(dateEvents.endAt, now),
    )).limit(2);
    if (active.length === 1) dateEventId = active[0].id;
  }

  const now = new Date();
  const pendingMedia = input.type !== "text";
  const [memory] = await db.insert(memories).values({
    dateEventId,
    missionId: null,
    createdBy: session.user.id,
    type: input.type,
    customTitle: input.customTitle ?? null,
    text: input.text || null,
    idempotencyKey: input.idempotencyKey,
    pendingReplacement: pendingMedia,
    firstPinnedAt: now,
    updatedAt: now,
  }).returning();
  await db.insert(auditEvents).values({ actorId: session.user.id, action: "memory.manual_created", entityType: "memory", entityId: memory.id });
  return json({ memory, reused: false }, 201);
});
