import { and, desc, eq, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { dateEvents, mediaAssets, memories, missions, users } from "@is2u/db/schema";
import { getMissionTemplate } from "@is2u/core/types";
import { compareMissionFeed, missionDisplayAt } from "@is2u/core/ordering";
import { requireSession } from "../../../lib/auth";
import { json, withApiErrors } from "../../../lib/http";

export const GET = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  const db = getDb();
  const now = new Date();
  await db.update(missions).set({ status: "expired", updatedAt: now }).where(and(eq(missions.status, "sent"), lt(missions.expiresAt, now)));
  const rows = await db.select({ mission: missions, dateEvent: dateEvents, recipient: users })
    .from(missions)
    .innerJoin(dateEvents, eq(missions.dateEventId, dateEvents.id))
    .innerJoin(users, eq(missions.recipientId, users.id))
    .where(or(eq(missions.isTest, true), ne(missions.status, "scheduled")))
    .orderBy(desc(missions.scheduledAt))
    .limit(120);

  const missionIds = rows.map(({ mission }) => mission.id);
  const memoryRows = missionIds.length
    ? await db.select().from(memories).where(and(
      inArray(memories.missionId, missionIds),
      isNull(memories.deletedAt),
      eq(memories.pendingReplacement, false),
    )).orderBy(desc(memories.createdAt))
    : [];
  const memoryIds = memoryRows.map((memory) => memory.id);
  const assets = memoryIds.length
    ? await db.select({ id: mediaAssets.id, memoryId: mediaAssets.memoryId, role: mediaAssets.role, mimeType: mediaAssets.mimeType, processingStatus: mediaAssets.processingStatus })
      .from(mediaAssets)
      .where(inArray(mediaAssets.memoryId, memoryIds))
    : [];
  const recipients = await db.select({ id: users.id, displayName: users.displayName, roleLabel: users.roleLabel }).from(users);

  const feed = rows.map(({ mission, dateEvent, recipient }) => {
      const memory = memoryRows.find((candidate) => candidate.missionId === mission.id) ?? null;
      const displayAt = missionDisplayAt({ ...mission, memoryCreatedAt: memory?.createdAt });
      return {
        id: mission.id,
        type: mission.type,
        status: mission.status,
        isTest: mission.isTest,
        scheduledAt: mission.scheduledAt,
        sentAt: mission.sentAt,
        expiresAt: mission.expiresAt,
        updatedAt: mission.updatedAt,
        displayAt,
        recipient: { id: recipient.id, displayName: recipient.displayName, roleLabel: recipient.roleLabel },
        dateEvent: { id: dateEvent.id, title: dateEvent.title, startAt: dateEvent.startAt, endAt: dateEvent.endAt, status: dateEvent.status },
        copy: getMissionTemplate(mission.templateId, mission.type),
        canOpen: (mission.recipientId === session.user.id && mission.status === "sent") || (mission.status === "completed" && Boolean(memory)),
        memory: memory ? {
          id: memory.id,
          type: memory.type,
          text: memory.text,
          emotion: memory.emotion,
          createdAt: memory.createdAt,
          assets: assets.filter((asset) => asset.memoryId === memory.id && asset.role !== "original"),
        } : null,
      };
    }).filter((item) => item.status !== "completed" || Boolean(item.memory));
  feed.sort((a, b) => compareMissionFeed(
    { ...a, memoryCreatedAt: a.memory?.createdAt },
    { ...b, memoryCreatedAt: b.memory?.createdAt },
    now,
  ));

  return json({
    currentUserId: session.user.id,
    recipients,
    missions: feed,
  });
});
