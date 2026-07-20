import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, dateEvents, memories } from "@is2u/db/schema";
import { memoryReplacementSchema } from "@is2u/core/validation";
import { requireCsrf, requireSession } from "../../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../../lib/http";
import { canAccessCouple } from "../../../../../lib/couples";

type Context = { params: Promise<{ id: string }> };

export const POST = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const input = memoryReplacementSchema.parse(await readJson(request));
  const db = getDb();
  const [current] = await db.select().from(memories).where(and(
    eq(memories.id, id),
    eq(memories.createdBy, session.user.id),
    isNull(memories.missionId),
    isNull(memories.deletedAt),
    eq(memories.pendingReplacement, false),
  )).limit(1);
  if (!current) throw new HttpError(404, "추억을 찾을 수 없어요");
  if (current.coupleId && !await canAccessCouple(session.user.id, current.coupleId)) throw new HttpError(404, "추억을 찾을 수 없어요");
  if (!["photo", "video", "manual_video", "audio"].includes(current.type)) throw new HttpError(400, "파일을 바꿀 수 없는 추억이에요");

  const [idempotent] = await db.select().from(memories).where(eq(memories.idempotencyKey, input.idempotencyKey)).limit(1);
  if (idempotent) {
    if (idempotent.createdBy !== session.user.id || idempotent.missionId || !idempotent.pendingReplacement) throw new HttpError(409, "이미 사용한 저장 요청이에요");
    return json({ memory: idempotent });
  }
  if (input.dateEventId) {
    const [event] = await db.select({ id: dateEvents.id }).from(dateEvents).where(and(
      eq(dateEvents.id, input.dateEventId),
      ...(current.coupleId ? [eq(dateEvents.coupleId, current.coupleId)] : []),
      eq(dateEvents.isTest, false),
      isNull(dateEvents.deletedAt),
    )).limit(1);
    if (!event || !current.coupleId) throw new HttpError(404, "연결할 약속을 찾을 수 없어요");
  }

  const now = new Date();
  const [replacement] = await db.insert(memories).values({
    coupleId: current.coupleId,
    dateEventId: input.dateEventId === undefined ? current.dateEventId : input.dateEventId,
    missionId: null,
    createdBy: session.user.id,
    type: current.type,
    customTitle: input.customTitle === undefined ? current.customTitle : input.customTitle,
    text: input.text === undefined ? current.text : input.text || null,
    idempotencyKey: input.idempotencyKey,
    pendingReplacement: true,
    createdAt: current.createdAt,
    firstPinnedAt: input.firstPinnedAt === undefined ? current.firstPinnedAt : input.firstPinnedAt,
    updatedAt: now,
  }).returning();
  await db.insert(auditEvents).values({ actorId: session.user.id, action: "memory.replacement_created", entityType: "memory", entityId: replacement.id, metadata: { replaces: current.id } });
  return json({ memory: replacement }, 201);
});
