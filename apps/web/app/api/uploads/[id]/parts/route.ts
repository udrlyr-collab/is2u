import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@is2u/db/client";
import { uploadSessions } from "@is2u/db/schema";
import { signUploadPart } from "@is2u/core/r2";
import { requireCsrf, requireSession } from "../../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../../lib/http";

const schema = z.object({ partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(100) });
type Context = { params: Promise<{ id: string }> };

export const POST = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const input = schema.parse(await readJson(request));
  const [upload] = await getDb().select().from(uploadSessions).where(and(eq(uploadSessions.id, id), eq(uploadSessions.ownerId, session.user.id))).limit(1);
  if (!upload?.multipartUploadId || upload.status !== "uploading") throw new HttpError(409, "여러 조각으로 올릴 수 없는 상태예요");
  if (upload.expiresAt < new Date()) throw new HttpError(410, "업로드 시간이 만료됐어요");
  const parts = await Promise.all(input.partNumbers.map(async (partNumber) => ({ partNumber, url: await signUploadPart(upload.objectKey, upload.multipartUploadId!, partNumber) })));
  return json({ parts });
});
