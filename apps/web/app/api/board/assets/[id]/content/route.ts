import { GetObjectCommand } from "@aws-sdk/client-s3";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@is2u/db/client";
import { boardAssets } from "@is2u/db/schema";
import { getServerEnv } from "@is2u/core/env";
import { getMediaR2 } from "@is2u/core/r2";
import { requireVisibleBoard } from "../../../../../../lib/board";
import { requireSession } from "../../../../../../lib/auth";
import { HttpError, withApiErrors } from "../../../../../../lib/http";

type Context = { params: Promise<{ id: string }> };

export const GET = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "사진을 찾을 수 없어요");
  const [asset] = await getDb().select().from(boardAssets).where(and(eq(boardAssets.id, id), eq(boardAssets.status, "ready"))).limit(1);
  if (!asset) throw new HttpError(404, "사진을 찾을 수 없어요");
  await requireVisibleBoard(session.user.id, asset.boardId);
  const range = request.headers.get("range") ?? undefined;
  const object = await getMediaR2().send(new GetObjectCommand({ Bucket: getServerEnv().R2_MEDIA_BUCKET, Key: asset.storageKey, Range: range }));
  if (!object.Body) throw new HttpError(404, "사진을 찾을 수 없어요");
  const body = await object.Body.transformToByteArray();
  const headers = new Headers({
    "Content-Type": object.ContentType ?? asset.mimeType,
    "Cache-Control": "private, max-age=300",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  });
  if (object.ContentLength !== undefined) headers.set("Content-Length", String(object.ContentLength));
  if (object.ContentRange) headers.set("Content-Range", object.ContentRange);
  return new Response(Uint8Array.from(body).buffer, { status: object.ContentRange ? 206 : 200, headers });
});
