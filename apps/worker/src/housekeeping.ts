import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { and, eq, gt, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { dateEvents, mediaAssets, memories, missions, uploadSessions } from "@is2u/db/schema";
import { abortMultipartUpload, getMediaR2 } from "@is2u/core/r2";
import { getServerEnv } from "@is2u/core/env";

export async function runHousekeeping(): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db.update(dateEvents).set({ status: "active", updatedAt: now }).where(and(
    eq(dateEvents.isTest, false), isNull(dateEvents.deletedAt), eq(dateEvents.status, "scheduled"), lt(dateEvents.startAt, now), gt(dateEvents.endAt, now),
  ));
  await db.update(dateEvents).set({ status: "completed", updatedAt: now }).where(and(
    eq(dateEvents.isTest, false), isNull(dateEvents.deletedAt), inArray(dateEvents.status, ["scheduled", "active"]), lt(dateEvents.endAt, now),
  ));
  await db.update(missions).set({ status: "expired", updatedAt: now }).where(and(isNull(missions.deletedAt), eq(missions.status, "sent"), lt(missions.expiresAt, now)));

  await db.execute(sql`
    update date_mission_schedules as schedule
    set next_mission_at = null,
        status = case when event.status = 'cancelled' or event.deleted_at is not null or couple.status = 'ended' then 'cancelled' else 'completed' end,
        updated_at = ${now}
    from date_events as event, couples as couple
    where schedule.date_event_id = event.id
      and schedule.couple_id = couple.id
      and schedule.status in ('waiting', 'active', 'paused')
      and (event.status in ('completed', 'cancelled') or event.deleted_at is not null or couple.status = 'ended')
  `);

  const expiredUploads = await db.select().from(uploadSessions).where(and(eq(uploadSessions.status, "uploading"), lt(uploadSessions.expiresAt, now)));
  for (const upload of expiredUploads) {
    if (upload.multipartUploadId) await abortMultipartUpload(upload.objectKey, upload.multipartUploadId).catch(() => undefined);
    await db.update(uploadSessions).set({ status: "expired", updatedAt: now }).where(eq(uploadSessions.id, upload.id));
  }

  const abandonedReplacementBefore = new Date(now.getTime() - 24 * 60 * 60_000);
  await db.update(memories).set({
    deletedAt: now,
    purgeAfter: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
  }).where(and(
    eq(memories.pendingReplacement, true),
    isNull(memories.deletedAt),
    lt(memories.createdAt, abandonedReplacementBefore),
  ));

  const purgeable = await db.select({ memory: memories }).from(memories).where(and(isNotNull(memories.purgeAfter), lt(memories.purgeAfter, now))).limit(25);
  const env = getServerEnv();
  for (const { memory } of purgeable) {
    const assets = await db.select().from(mediaAssets).where(eq(mediaAssets.memoryId, memory.id));
    if (assets.length) await getMediaR2().send(new DeleteObjectsCommand({ Bucket: env.R2_MEDIA_BUCKET, Delete: { Objects: assets.map((asset) => ({ Key: asset.storageKey })), Quiet: true } }));
    await db.delete(memories).where(eq(memories.id, memory.id));
  }

  const purgeableMissions = await db.select({ mission: missions }).from(missions).where(and(
    isNotNull(missions.purgeAfter),
    lt(missions.purgeAfter, now),
  )).limit(25);
  for (const { mission } of purgeableMissions) {
    const [relatedMemory] = await db.select({ id: memories.id }).from(memories).where(eq(memories.missionId, mission.id)).limit(1);
    if (!relatedMemory) await db.delete(missions).where(eq(missions.id, mission.id));
  }
}
