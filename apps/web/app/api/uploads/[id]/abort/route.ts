import { and, eq } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { uploadSessions } from "@is2u/db/schema";
import { abortMultipartUpload } from "@is2u/core/r2";
import { requireCsrf, requireSession } from "../../../../../lib/auth";
import { HttpError, json, withApiErrors } from "../../../../../lib/http";

type Context = { params: Promise<{ id: string }> };

export const POST = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const [upload] = await getDb().select().from(uploadSessions).where(and(eq(uploadSessions.id, id), eq(uploadSessions.ownerId, session.user.id))).limit(1);
  if (!upload) throw new HttpError(404, "업로드를 찾을 수 없어요");
  if (upload.multipartUploadId && upload.status === "uploading") await abortMultipartUpload(upload.objectKey, upload.multipartUploadId);
  await getDb().update(uploadSessions).set({ status: "aborted", updatedAt: new Date() }).where(eq(uploadSessions.id, id));
  return json({ ok: true });
});
