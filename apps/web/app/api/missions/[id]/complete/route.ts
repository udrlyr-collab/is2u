import { and, eq } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, memories, missions } from "@is2u/db/schema";
import { missionCompletionSchema } from "@is2u/core/validation";
import { requireCsrf, requireSession } from "../../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../../lib/http";

type Context = { params: Promise<{ id: string }> };

export const POST = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const input = missionCompletionSchema.parse(await readJson(request));
  const db = getDb();
  const [mission] = await db.select().from(missions).where(and(eq(missions.id, id), eq(missions.recipientId, session.user.id))).limit(1);
  if (!mission) throw new HttpError(404, "미션을 찾을 수 없습니다.");
  if (mission.expiresAt && mission.expiresAt < new Date()) {
    await db.update(missions).set({ status: "expired", updatedAt: new Date() }).where(eq(missions.id, id));
    throw new HttpError(410, "이 미션은 조용히 지나갔어요.");
  }
  if (mission.status === "completed") {
    const [existing] = await db.select().from(memories).where(eq(memories.missionId, id)).limit(1);
    return json({ memory: existing });
  }
  if (mission.status !== "sent") throw new HttpError(409, "지금 완료할 수 없는 미션입니다.");
  if (input.memoryType !== mission.type) throw new HttpError(400, "미션과 기록 형식이 일치하지 않습니다.");

  const memory = await db.transaction(async (tx) => {
    const [created] = await tx.insert(memories).values({
      dateEventId: mission.dateEventId,
      missionId: mission.id,
      createdBy: session.user.id,
      type: input.memoryType,
      text: input.memoryType === "text" ? input.text : null,
      emotion: input.memoryType === "emotion" ? input.emotion : null,
      idempotencyKey: input.idempotencyKey,
    }).onConflictDoNothing().returning();
    const resolved = created ?? (await tx.select().from(memories).where(eq(memories.missionId, mission.id)).limit(1))[0];
    await tx.update(missions).set({ status: "completed", updatedAt: new Date() }).where(eq(missions.id, mission.id));
    await tx.insert(auditEvents).values({ actorId: session.user.id, action: "mission.completed", entityType: "mission", entityId: mission.id });
    return resolved;
  });
  return json({ memory });
});

