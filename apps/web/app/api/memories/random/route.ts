import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { dateEvents, mediaAssets, memories, missions } from "@is2u/db/schema";
import { requireSession } from "../../../../lib/auth";
import { json, withApiErrors } from "../../../../lib/http";
import { getAccessibleCoupleIds } from "../../../../lib/couples";

export const GET = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  const coupleIds = await getAccessibleCoupleIds(session.user.id);
  const exclude = new URL(request.url).searchParams.get("exclude");
  const conditions = [
    isNull(memories.deletedAt),
    eq(memories.pendingReplacement, false),
    or(and(isNull(memories.coupleId), eq(memories.createdBy, session.user.id)), ...(coupleIds.length ? [inArray(memories.coupleId, coupleIds)] : []))!,
    or(isNull(memories.missionId), and(eq(missions.isTest, false), isNull(missions.deletedAt)))!,
  ];
  if (exclude) conditions.push(ne(memories.id, exclude));
  const [memory] = await getDb().select({ memory: memories, dateEvent: dateEvents }).from(memories).leftJoin(dateEvents, eq(memories.dateEventId, dateEvents.id)).leftJoin(missions, eq(memories.missionId, missions.id)).where(and(...conditions)).orderBy(sql`random()`).limit(1);
  if (!memory) return json({ memory: null });
  const assets = await getDb().select().from(mediaAssets).where(and(
    eq(mediaAssets.memoryId, memory.memory.id),
    or(eq(mediaAssets.role, "original"), eq(mediaAssets.processingStatus, "ready")),
  ));
  return json({ memory: { ...memory.memory, dateEvent: memory.dateEvent, assets } });
});
