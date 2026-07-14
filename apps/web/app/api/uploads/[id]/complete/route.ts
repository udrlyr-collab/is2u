import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@is2u/db/client";
import { mediaAssets, processingJobs, uploadSessions } from "@is2u/db/schema";
import { completeMultipartUpload, headMediaObject } from "@is2u/core/r2";
import { requireCsrf, requireSession } from "../../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../../lib/http";
import { getBoss, QUEUES } from "../../../../../lib/queue";

const schema = z.object({ parts: z.array(z.object({ partNumber: z.number().int().min(1), etag: z.string().min(1) })).max(10_000).default([]) });
type Context = { params: Promise<{ id: string }> };

export const POST = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const input = schema.parse(await readJson(request));
  const [row] = await getDb().select({ upload: uploadSessions, asset: mediaAssets }).from(uploadSessions).innerJoin(mediaAssets, eq(uploadSessions.assetId, mediaAssets.id)).where(and(eq(uploadSessions.id, id), eq(uploadSessions.ownerId, session.user.id))).limit(1);
  if (!row) throw new HttpError(404, "업로드를 찾을 수 없습니다.");
  if (row.upload.status === "uploaded") return json(row);
  if (row.upload.status !== "uploading") throw new HttpError(409, "완료할 수 없는 업로드입니다.");
  if (row.upload.multipartUploadId) {
    if (!input.parts.length) throw new HttpError(400, "업로드된 부품 정보가 필요합니다.");
    const sorted = [...input.parts].sort((a, b) => a.partNumber - b.partNumber).map((part) => ({ PartNumber: part.partNumber, ETag: part.etag }));
    await completeMultipartUpload(row.upload.objectKey, row.upload.multipartUploadId, sorted);
  }
  const head = await headMediaObject(row.upload.objectKey);
  if (Number(head.ContentLength) !== row.asset.fileSize) throw new HttpError(409, "업로드된 파일 크기가 일치하지 않습니다.");

  const [job] = await getDb().transaction(async (tx) => {
    await tx.update(uploadSessions).set({ status: "uploaded", parts: input.parts, updatedAt: new Date() }).where(eq(uploadSessions.id, id));
    const [created] = await tx.insert(processingJobs).values({ jobType: "process-media", assetId: row.asset.id }).returning();
    return [created];
  });
  await (await getBoss()).send(QUEUES.processMedia, { processingJobId: job.id, assetId: row.asset.id }, { retryLimit: 3 });
  return json({ upload: { ...row.upload, status: "uploaded", parts: input.parts }, asset: row.asset });
});

