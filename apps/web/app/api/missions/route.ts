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
    .leftJoin(dateEvents, eq(missions.dateEventId, dateEvents.id))
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
  const manualRows = await db.select({ memory: memories, dateEvent: dateEvents, author: users })
    .from(memories)
    .innerJoin(users, eq(memories.createdBy, users.id))
    .leftJoin(dateEvents, eq(memories.dateEventId, dateEvents.id))
    .where(and(isNull(memories.missionId), isNull(memories.deletedAt), eq(memories.pendingReplacement, false)))
    .orderBy(desc(memories.firstPinnedAt))
    .limit(120);
  const allMemories = [...memoryRows, ...manualRows.map(({ memory }) => memory)];
  const memoryIds = allMemories.map((memory) => memory.id);
  const assets = memoryIds.length
    ? await db.select({ id: mediaAssets.id, memoryId: mediaAssets.memoryId, role: mediaAssets.role, mimeType: mediaAssets.mimeType, processingStatus: mediaAssets.processingStatus })
      .from(mediaAssets)
      .where(inArray(mediaAssets.memoryId, memoryIds))
    : [];
  const recipients = await db.select({ id: users.id, displayName: users.displayName, roleLabel: users.roleLabel }).from(users);

  const missionFeed = rows.map(({ mission, dateEvent, recipient }) => {
      const memory = memoryRows.find((candidate) => candidate.missionId === mission.id) ?? null;
      const displayAt = missionDisplayAt({ ...mission, memoryCreatedAt: memory?.createdAt, memoryFirstPinnedAt: memory?.firstPinnedAt });
      return {
        id: mission.id,
        type: mission.type,
        status: mission.status,
        kind: "mission" as const,
        isTest: mission.isTest,
        source: mission.source,
        scheduledAt: mission.scheduledAt,
        sentAt: mission.sentAt,
        expiresAt: mission.expiresAt,
        updatedAt: mission.updatedAt,
        displayAt,
        recipient: { id: recipient.id, displayName: recipient.displayName, roleLabel: recipient.roleLabel },
        dateEvent: dateEvent ? { id: dateEvent.id, title: dateEvent.title, startAt: dateEvent.startAt, endAt: dateEvent.endAt, status: dateEvent.status, deletedAt: dateEvent.deletedAt } : null,
        copy: getMissionTemplate(mission.templateId, mission.type),
        canOpen: (mission.recipientId === session.user.id && mission.status === "sent") || (mission.status === "completed" && Boolean(memory)),
        memory: memory ? {
          id: memory.id,
          type: memory.type,
          customTitle: memory.customTitle,
          text: memory.text,
          emotion: memory.emotion,
          createdAt: memory.createdAt,
          firstPinnedAt: memory.firstPinnedAt,
          updatedAt: memory.updatedAt,
          assets: assets.filter((asset) => asset.memoryId === memory.id && asset.role !== "original"),
        } : null,
      };
    }).filter((item) => item.status !== "completed" || Boolean(item.memory));
  const manualFeed = manualRows.map(({ memory, dateEvent, author }) => ({
    id: memory.id,
    kind: "manual" as const,
    type: memory.type,
    status: "completed" as const,
    isTest: false,
    source: "manual" as const,
    scheduledAt: memory.firstPinnedAt,
    sentAt: null,
    expiresAt: null,
    updatedAt: memory.updatedAt,
    displayAt: memory.firstPinnedAt,
    recipient: { id: author.id, displayName: author.displayName, roleLabel: author.roleLabel },
    dateEvent: dateEvent ? { id: dateEvent.id, title: dateEvent.title, startAt: dateEvent.startAt, endAt: dateEvent.endAt, status: dateEvent.status, deletedAt: dateEvent.deletedAt } : null,
    copy: null,
    canOpen: true,
    memory: {
      id: memory.id,
      type: memory.type,
      customTitle: memory.customTitle,
      text: memory.text,
      emotion: memory.emotion,
      createdAt: memory.createdAt,
      firstPinnedAt: memory.firstPinnedAt,
      updatedAt: memory.updatedAt,
      assets: assets.filter((asset) => asset.memoryId === memory.id && asset.role !== "original"),
    },
  }));
  const feed = [...missionFeed, ...manualFeed].sort((a, b) => new Date(b.displayAt).getTime() - new Date(a.displayAt).getTime());

  return json({
    currentUserId: session.user.id,
    recipients,
    entries: feed,
  });
});
