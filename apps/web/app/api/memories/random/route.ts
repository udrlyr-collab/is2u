import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { dateEvents, mediaAssets, memories, missions } from "@is2u/db/schema";
import { requireSession } from "../../../../lib/auth";
import { json, withApiErrors } from "../../../../lib/http";

export const GET = withApiErrors(async (request: Request) => {
  await requireSession(request);
  const exclude = new URL(request.url).searchParams.get("exclude");
  const conditions = [isNull(memories.deletedAt), or(isNull(memories.missionId), eq(missions.isTest, false))!];
  if (exclude) conditions.push(ne(memories.id, exclude));
  const [memory] = await getDb().select({ memory: memories, dateEvent: dateEvents }).from(memories).innerJoin(dateEvents, eq(memories.dateEventId, dateEvents.id)).leftJoin(missions, eq(memories.missionId, missions.id)).where(and(...conditions)).orderBy(sql`random()`).limit(1);
  if (!memory) return json({ memory: null });
  const assets = await getDb().select().from(mediaAssets).where(and(
    eq(mediaAssets.memoryId, memory.memory.id),
    or(eq(mediaAssets.role, "original"), eq(mediaAssets.processingStatus, "ready")),
  ));
  return json({ memory: { ...memory.memory, dateEvent: memory.dateEvent, assets } });
});
