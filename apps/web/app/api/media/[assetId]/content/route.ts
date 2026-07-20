import { GetObjectCommand } from "@aws-sdk/client-s3";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@is2u/db/client";
import { mediaAssets, memories } from "@is2u/db/schema";
import { getServerEnv } from "@is2u/core/env";
import { getMediaR2 } from "@is2u/core/r2";
import { requireSession } from "../../../../../lib/auth";
import { canAccessMemory } from "../../../../../lib/couples";
import { HttpError, withApiErrors } from "../../../../../lib/http";

type Context = { params: Promise<{ assetId: string }> };

export const GET = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  const { assetId } = await context.params;
  if (!z.string().uuid().safeParse(assetId).success) throw new HttpError(404, "미디어를 찾을 수 없어요");
  const [row] = await getDb().select({ asset: mediaAssets, memory: memories }).from(mediaAssets).innerJoin(memories, eq(mediaAssets.memoryId, memories.id)).where(and(eq(mediaAssets.id, assetId), ne(mediaAssets.role, "original"), eq(mediaAssets.processingStatus, "ready"))).limit(1);
  if (!row || !await canAccessMemory(session.user.id, row.memory)) throw new HttpError(404, "미디어를 찾을 수 없어요");
  const range = request.headers.get("range") ?? undefined;
  const object = await getMediaR2().send(new GetObjectCommand({ Bucket: getServerEnv().R2_MEDIA_BUCKET, Key: row.asset.storageKey, Range: range }));
  if (!object.Body) throw new HttpError(404, "미디어를 찾을 수 없어요");
  const body = await object.Body.transformToByteArray();
  const headers = new Headers({
    "Content-Type": object.ContentType ?? row.asset.mimeType,
    "Cache-Control": "private, max-age=300",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  });
  if (object.ContentLength !== undefined) headers.set("Content-Length", String(object.ContentLength));
  if (object.ContentRange) headers.set("Content-Range", object.ContentRange);
  return new Response(Uint8Array.from(body).buffer, { status: object.ContentRange ? 206 : 200, headers });
});
