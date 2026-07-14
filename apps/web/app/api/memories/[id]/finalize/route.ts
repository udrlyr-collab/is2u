import { and, eq } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, mediaAssets, memories } from "@is2u/db/schema";
import { requireCsrf, requireSession } from "../../../../../lib/auth";
import { HttpError, json, withApiErrors } from "../../../../../lib/http";

type Context = { params: Promise<{ id: string }> };

export const POST = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const db = getDb();
  const [original] = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(and(eq(mediaAssets.memoryId, id), eq(mediaAssets.role, "original"))).limit(1);
  if (!original) throw new HttpError(409, "원본 파일 업로드가 아직 끝나지 않았어요");
  const [memory] = await db.update(memories).set({ pendingReplacement: false }).where(and(
    eq(memories.id, id), eq(memories.createdBy, session.user.id), eq(memories.pendingReplacement, true),
  )).returning();
  if (!memory) throw new HttpError(404, "추억을 찾을 수 없어요");
  await db.insert(auditEvents).values({ actorId: session.user.id, action: "memory.manual_finalized", entityType: "memory", entityId: id });
  return json({ memory });
});
