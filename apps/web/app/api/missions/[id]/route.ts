import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { dateEvents, mediaAssets, memories, missions, users } from "@is2u/db/schema";
import { MISSION_COPY } from "@is2u/core/types";
import { requireSession } from "../../../../lib/auth";
import { HttpError, json, withApiErrors } from "../../../../lib/http";

type Context = { params: Promise<{ id: string }> };

function publicAsset(asset: typeof mediaAssets.$inferSelect) {
  return {
    id: asset.id,
    role: asset.role,
    mimeType: asset.mimeType,
    fileSize: asset.fileSize,
    originalFilename: asset.originalFilename,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    processingStatus: asset.processingStatus,
    createdAt: asset.createdAt,
  };
}

export const GET = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  const { id } = await context.params;
  const db = getDb();
  const [row] = await db.select({ mission: missions, dateEvent: dateEvents, recipient: users })
    .from(missions)
    .innerJoin(dateEvents, eq(missions.dateEventId, dateEvents.id))
    .innerJoin(users, eq(missions.recipientId, users.id))
    .where(eq(missions.id, id))
    .limit(1);
  if (!row || (row.mission.recipientId !== session.user.id && row.mission.status !== "completed")) throw new HttpError(404, "미션을 찾을 수 없습니다.");

  const [memory] = await db.select().from(memories).where(and(eq(memories.missionId, id), isNull(memories.deletedAt))).limit(1);
  const archiveMemories = row.mission.status === "completed"
    ? await db.select().from(memories).where(and(eq(memories.dateEventId, row.dateEvent.id), eq(memories.type, "manual_video"), isNull(memories.deletedAt)))
    : [];
  const memoryIds = [memory?.id, ...archiveMemories.map((item) => item.id)].filter((value): value is string => Boolean(value));
  const assets = memoryIds.length ? await db.select().from(mediaAssets).where(inArray(mediaAssets.memoryId, memoryIds)) : [];

  return json({
    mission: { ...row.mission, copy: MISSION_COPY[row.mission.type] },
    dateEvent: row.dateEvent,
    recipient: { id: row.recipient.id, displayName: row.recipient.displayName, roleLabel: row.recipient.roleLabel },
    memory: memory ? { ...memory, assets: assets.filter((asset) => asset.memoryId === memory.id).map(publicAsset) } : null,
    originalArchive: archiveMemories.map((archive) => ({
      ...archive,
      assets: assets.filter((asset) => asset.memoryId === archive.id).map(publicAsset),
    })),
  });
});
