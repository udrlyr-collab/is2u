import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { mediaAssets, memories, uploadSessions } from "@is2u/db/schema";
import { getServerEnv } from "@is2u/core/env";
import { createMultipartUpload, createSingleUpload } from "@is2u/core/r2";
import { classifyMedia, safeExtension, uploadCreateSchema } from "@is2u/core/validation";
import { requireCsrf, requireSession } from "../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../lib/http";

const MULTIPART_THRESHOLD = 100 * 1024 * 1024;
const PART_SIZE = 16 * 1024 * 1024;

export const POST = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const input = uploadCreateSchema.parse(await readJson(request));
  const [memory] = await getDb().select().from(memories).where(and(eq(memories.id, input.memoryId), eq(memories.createdBy, session.user.id))).limit(1);
  if (!memory || memory.deletedAt) throw new HttpError(404, "기억을 찾을 수 없습니다.");
  const mediaKind = classifyMedia(input.mimeType);
  if (!mediaKind) throw new HttpError(400, "지원하지 않는 파일 형식입니다.");
  if ((memory.type === "manual_video" || memory.type === "video") && mediaKind !== "video") throw new HttpError(400, "동영상 파일을 선택해 주세요.");
  if (memory.type === "photo" && mediaKind !== "photo") throw new HttpError(400, "사진 파일을 선택해 주세요.");
  if (memory.type === "audio" && mediaKind !== "audio") throw new HttpError(400, "오디오 파일을 선택해 주세요.");

  const env = getServerEnv();
  const limit = memory.type === "manual_video" ? env.MAX_MANUAL_VIDEO_BYTES
    : mediaKind === "video" ? env.MAX_MISSION_VIDEO_BYTES
      : mediaKind === "photo" ? env.MAX_PHOTO_BYTES : env.MAX_AUDIO_BYTES;
  if (input.size > limit) throw new HttpError(413, "파일 크기가 허용 범위를 넘었습니다.");

  const assetId = randomUUID();
  const objectKey = `originals/${memory.id}/${assetId}/source.${safeExtension(input.filename, input.mimeType)}`;
  const multipart = input.size >= MULTIPART_THRESHOLD;
  const uploadId = multipart ? await createMultipartUpload(objectKey, input.mimeType) : null;
  const [asset] = await getDb().insert(mediaAssets).values({
    id: assetId,
    memoryId: memory.id,
    role: "original",
    storageKey: objectKey,
    originalFilename: input.filename,
    mimeType: input.mimeType,
    fileSize: input.size,
    processingStatus: "pending",
  }).returning();
  const [upload] = await getDb().insert(uploadSessions).values({
    ownerId: session.user.id,
    assetId: asset.id,
    objectKey,
    multipartUploadId: uploadId,
    status: "uploading",
    expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
  }).returning();
  const url = multipart ? null : await createSingleUpload(objectKey, input.mimeType);
  return json({ upload: { id: upload.id, assetId, multipart, uploadId, url, partSize: PART_SIZE, expiresAt: upload.expiresAt } }, 201);
});

