import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@is2u/db/client";
import { auditEvents, mediaAssets, memories, missions } from "@is2u/db/schema";
import { requireCsrf, requireSession } from "../../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../../lib/http";

type Context = { params: Promise<{ id: string }> };

export const POST = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const { memoryId } = z.object({ memoryId: z.uuid() }).parse(await readJson(request));
  const db = getDb();
  const [mission] = await db.select().from(missions).where(and(eq(missions.id, id), eq(missions.recipientId, session.user.id))).limit(1);
  const [replacement] = await db.select().from(memories).where(and(
    eq(memories.id, memoryId),
    eq(memories.missionId, id),
    eq(memories.createdBy, session.user.id),
    eq(memories.pendingReplacement, true),
  )).limit(1);
  if (!mission || !replacement) throw new HttpError(404, "새 기록을 찾을 수 없습니다.");
  if (["photo", "video", "audio"].includes(replacement.type)) {
    const [original] = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(and(eq(mediaAssets.memoryId, memoryId), eq(mediaAssets.role, "original"))).limit(1);
    if (!original) throw new HttpError(409, "새 기록의 저장이 아직 끝나지 않았어요.");
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(memories).set({
      deletedAt: now,
      purgeAfter: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
    }).where(and(
      eq(memories.missionId, id),
      ne(memories.id, memoryId),
      isNull(memories.deletedAt),
      eq(memories.pendingReplacement, false),
    ));
    await tx.update(memories).set({ pendingReplacement: false }).where(eq(memories.id, memoryId));
    await tx.insert(auditEvents).values({ actorId: session.user.id, action: "mission.replacement_finalized", entityType: "mission", entityId: id });
  });
  return json({ ok: true });
});
