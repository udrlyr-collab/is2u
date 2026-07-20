import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@is2u/db/client";
import { auditEvents, mediaAssets, memories } from "@is2u/db/schema";
import { requireCsrf, requireSession } from "../../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../../lib/http";

type Context = { params: Promise<{ id: string }> };

export const POST = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const { memoryId } = z.object({ memoryId: z.uuid() }).parse(await readJson(request));
  const db = getDb();
  const [current] = await db.select().from(memories).where(and(
    eq(memories.id, id),
    eq(memories.createdBy, session.user.id),
    isNull(memories.missionId),
    isNull(memories.deletedAt),
    eq(memories.pendingReplacement, false),
  )).limit(1);
  const [replacement] = await db.select().from(memories).where(and(
    eq(memories.id, memoryId),
    eq(memories.createdBy, session.user.id),
    isNull(memories.missionId),
    isNull(memories.deletedAt),
    eq(memories.pendingReplacement, true),
  )).limit(1);
  if (!current || !replacement || current.type !== replacement.type) throw new HttpError(404, "새 추억을 찾을 수 없어요");
  const [original] = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(and(
    eq(mediaAssets.memoryId, replacement.id),
    eq(mediaAssets.role, "original"),
  )).limit(1);
  if (!original) throw new HttpError(409, "새 파일의 저장이 아직 끝나지 않았어요");

  const now = new Date();
  const purgeAfter = new Date(now.getTime() + 30 * 24 * 60 * 60_000);
  await db.transaction(async (tx) => {
    await tx.update(memories).set({ deletedAt: now, purgeAfter, updatedAt: now }).where(eq(memories.id, current.id));
    await tx.update(memories).set({ pendingReplacement: false, updatedAt: now }).where(eq(memories.id, replacement.id));
    await tx.insert(auditEvents).values({ actorId: session.user.id, action: "memory.replacement_finalized", entityType: "memory", entityId: replacement.id, metadata: { replaces: current.id } });
  });
  return json({ memoryId: replacement.id });
});
