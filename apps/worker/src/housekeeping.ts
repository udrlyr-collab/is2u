import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { and, eq, gt, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { dateEvents, mediaAssets, memories, missions, uploadSessions } from "@is2u/db/schema";
import { abortMultipartUpload, getMediaR2 } from "@is2u/core/r2";
import { getServerEnv } from "@is2u/core/env";
import { scheduleMissionForDate } from "../../web/lib/scheduler";

export async function runHousekeeping(): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db.update(dateEvents).set({ status: "active", updatedAt: now }).where(and(
    eq(dateEvents.isTest, false), isNull(dateEvents.deletedAt), eq(dateEvents.status, "scheduled"), lt(dateEvents.startAt, now), gt(dateEvents.endAt, now),
  ));
  await db.update(dateEvents).set({ status: "completed", updatedAt: now }).where(and(
    eq(dateEvents.isTest, false), isNull(dateEvents.deletedAt), inArray(dateEvents.status, ["scheduled", "active"]), lt(dateEvents.endAt, now),
  ));
  await db.update(missions).set({ status: "expired", updatedAt: now }).where(and(eq(missions.status, "sent"), lt(missions.expiresAt, now)));

  const activeEvents = await db.select({ id: dateEvents.id }).from(dateEvents).where(and(
    eq(dateEvents.isTest, false), isNull(dateEvents.deletedAt), eq(dateEvents.status, "active"), lt(dateEvents.startAt, now), gt(dateEvents.endAt, now),
  ));
  for (const event of activeEvents) await scheduleMissionForDate(event.id);

  const expiredUploads = await db.select().from(uploadSessions).where(and(eq(uploadSessions.status, "uploading"), lt(uploadSessions.expiresAt, now)));
  for (const upload of expiredUploads) {
    if (upload.multipartUploadId) await abortMultipartUpload(upload.objectKey, upload.multipartUploadId).catch(() => undefined);
    await db.update(uploadSessions).set({ status: "expired", updatedAt: now }).where(eq(uploadSessions.id, upload.id));
  }

  const purgeable = await db.select({ memory: memories }).from(memories).where(and(isNotNull(memories.purgeAfter), lt(memories.purgeAfter, now))).limit(25);
  const env = getServerEnv();
  for (const { memory } of purgeable) {
    const assets = await db.select().from(mediaAssets).where(eq(mediaAssets.memoryId, memory.id));
    if (assets.length) await getMediaR2().send(new DeleteObjectsCommand({ Bucket: env.R2_MEDIA_BUCKET, Delete: { Objects: assets.map((asset) => ({ Key: asset.storageKey })), Quiet: true } }));
    await db.delete(memories).where(eq(memories.id, memory.id));
  }
}
