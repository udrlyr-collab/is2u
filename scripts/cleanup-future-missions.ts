import { and, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { auditEvents, dateEvents, memories, missions } from "@is2u/db/schema";
import { getBoss, QUEUES } from "../apps/web/lib/queue";

const apply = process.argv.includes("--apply");
const db = getDb();
const now = new Date();
const candidates = await db.select({ mission: missions, event: dateEvents })
  .from(missions)
  .innerJoin(dateEvents, eq(missions.dateEventId, dateEvents.id))
  .where(and(
    eq(missions.isTest, false),
    inArray(missions.status, ["scheduled", "sent"]),
    gt(dateEvents.startAt, now),
  ));

const ids = candidates.map(({ mission }) => mission.id);
const memoryRows = ids.length
  ? await db.select({ missionId: memories.missionId }).from(memories).where(inArray(memories.missionId, ids))
  : [];
const protectedIds = new Set(memoryRows.map(({ missionId }) => missionId).filter((id): id is string => Boolean(id)));
const removable = candidates.filter(({ mission }) => !protectedIds.has(mission.id));

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", candidates: candidates.length, removable: removable.length, protected: protectedIds.size }));

if (apply && removable.length) {
  const boss = await getBoss();
  try {
    for (const { mission } of removable) {
      if (mission.jobId) await boss.cancel(QUEUES.deliverMission, mission.jobId).catch(() => undefined);
    }
    await db.transaction(async (tx) => {
      await tx.delete(missions).where(inArray(missions.id, removable.map(({ mission }) => mission.id)));
      await tx.insert(auditEvents).values(removable.map(({ mission, event }) => ({
        action: "mission.cleanup_future",
        entityType: "mission",
        entityId: mission.id,
        metadata: { dateEventId: event.id, previousStatus: mission.status },
      })));
    });
  } finally {
    await boss.stop({ graceful: true, timeout: 10_000 });
  }
}

if (protectedIds.size) process.exitCode = 2;
