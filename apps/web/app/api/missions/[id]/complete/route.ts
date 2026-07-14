import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, memories, missions } from "@is2u/db/schema";
import { getMissionTemplate } from "@is2u/core/types";
import { missionCompletionSchema, resolveEmotion } from "@is2u/core/validation";
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
  if (mission.expiresAt && mission.expiresAt < new Date() && mission.status !== "completed") {
    await db.update(missions).set({ status: "expired", updatedAt: new Date() }).where(eq(missions.id, id));
    throw new HttpError(410, "이 미션은 조용히 지나갔어요.");
  }
  if (input.memoryType !== mission.type) throw new HttpError(400, "미션과 기록 형식이 일치하지 않습니다.");
  const template = getMissionTemplate(mission.templateId, mission.type);
  if (input.memoryType === "text" && template.maxLength && (input.text?.length ?? 0) > template.maxLength) {
    throw new HttpError(400, `이 미션은 ${template.maxLength}자까지 남길 수 있어요.`);
  }

  const [idempotent] = await db.select().from(memories).where(eq(memories.idempotencyKey, input.idempotencyKey)).limit(1);
  if (idempotent) {
    if (idempotent.missionId !== mission.id || idempotent.createdBy !== session.user.id) throw new HttpError(409, "이미 사용된 저장 요청입니다.");
    return json({ memory: idempotent });
  }

  const [existing] = await db.select().from(memories).where(and(
    eq(memories.missionId, id),
    isNull(memories.deletedAt),
    eq(memories.pendingReplacement, false),
  )).orderBy(desc(memories.createdAt)).limit(1);
  const replacing = mission.status === "completed";
  if (replacing && (!input.replaceExisting || !existing || existing.createdBy !== session.user.id)) {
    throw new HttpError(403, "이 기록은 완료한 사람만 다시 남길 수 있어요.");
  }
  if (!replacing && mission.status !== "sent") throw new HttpError(409, "지금 완료할 수 없는 미션입니다.");

  const emotion = input.memoryType === "emotion" ? resolveEmotion(input) : null;
  if (input.memoryType === "emotion" && !emotion) throw new HttpError(400, "마음을 하나 골라 주세요.");
  const pendingReplacement = replacing && input.deferReplacement;
  const now = new Date();
  const memory = await db.transaction(async (tx) => {
    const [created] = await tx.insert(memories).values({
      dateEventId: mission.dateEventId,
      missionId: mission.id,
      createdBy: session.user.id,
      type: input.memoryType,
      text: input.memoryType === "text" ? input.text : null,
      emotion,
      idempotencyKey: input.idempotencyKey,
      pendingReplacement,
      firstPinnedAt: existing?.firstPinnedAt ?? now,
      updatedAt: now,
    }).returning();
    if (replacing && !pendingReplacement) {
      await tx.update(memories).set({
        deletedAt: now,
        purgeAfter: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
      }).where(and(
        eq(memories.missionId, mission.id),
        ne(memories.id, created.id),
        isNull(memories.deletedAt),
        eq(memories.pendingReplacement, false),
      ));
    }
    await tx.update(missions).set({ status: "completed", updatedAt: now }).where(eq(missions.id, mission.id));
    await tx.insert(auditEvents).values({
      actorId: session.user.id,
      action: replacing ? "mission.redone" : "mission.completed",
      entityType: "mission",
      entityId: mission.id,
    });
    return created;
  });
  return json({ memory });
});
