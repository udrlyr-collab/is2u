import { eq } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, dateEvents, memories } from "@is2u/db/schema";
import { manualMemorySchema } from "@is2u/core/validation";
import { requireCsrf, requireSession } from "../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../lib/http";

export const POST = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const input = manualMemorySchema.parse(await readJson(request));
  const [event] = await getDb().select({ id: dateEvents.id }).from(dateEvents).where(eq(dateEvents.id, input.dateEventId)).limit(1);
  if (!event) throw new HttpError(404, "일정을 찾을 수 없습니다.");
  const [memory] = await getDb().insert(memories).values({
    dateEventId: input.dateEventId,
    createdBy: session.user.id,
    type: "manual_video",
    text: input.note || null,
    idempotencyKey: input.idempotencyKey,
  }).onConflictDoNothing().returning();
  const resolved = memory ?? (await getDb().select().from(memories).where(eq(memories.idempotencyKey, input.idempotencyKey)).limit(1))[0];
  await getDb().insert(auditEvents).values({ actorId: session.user.id, action: "memory.manual_created", entityType: "memory", entityId: resolved.id });
  return json({ memory: resolved }, 201);
});

