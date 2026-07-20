import { and, asc, desc, eq, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { boardAssets, boardItems, boardThreadItems, boardThreads, dateEvents, mediaAssets, memories, memoryBoards, memoryGroupItems, memoryGroups, missions, users } from "@is2u/db/schema";
import { getMissionTemplate, memoryDisplayTitle, relationshipLabel, type MemoryType } from "@is2u/core/types";
import { getAccessibleCoupleIds, getActiveCouple } from "./couples";
import { HttpError } from "./http";

export const BOARD_WIDTH = 1800;
export const BOARD_HEIGHT = 1400;

export type BoardMemorySummary = {
  id: string;
  type: MemoryType;
  title: string;
  text: string | null;
  emotion: string | null;
  firstPinnedAt: Date;
  author: { id: string; displayName: string; roleLabel: string };
  dateEvent: { id: string; title: string } | null;
  assets: Array<{ id: string; role: "preview" | "thumbnail" | "poster"; mimeType: string; durationMs: number | null }>;
};

export async function getOrCreateBoard(ownerId: string) {
  const db = getDb();
  const [existing] = await db.select().from(memoryBoards).where(eq(memoryBoards.ownerId, ownerId)).orderBy(asc(memoryBoards.createdAt)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(memoryBoards).values({ ownerId, title: "첫 번째 보드" }).returning();
  return created;
}

export async function findBoard(ownerId: string, boardId?: string) {
  return (await getDb().select().from(memoryBoards).where(and(eq(memoryBoards.ownerId, ownerId), ...(boardId ? [eq(memoryBoards.id, boardId)] : []))).orderBy(asc(memoryBoards.createdAt)).limit(1))[0] ?? null;
}

export async function requireOwnBoard(userId: string, boardId?: string) {
  if (!boardId) return getOrCreateBoard(userId);
  const board = await findBoard(userId, boardId);
  if (!board) throw new HttpError(404, "보드를 찾을 수 없어요");
  return board;
}

export async function requireVisibleBoard(userId: string, boardId: string) {
  const [board] = await getDb().select().from(memoryBoards).where(eq(memoryBoards.id, boardId)).limit(1);
  if (!board || !await canViewBoardOwner(userId, board.ownerId) || (board.ownerId !== userId && board.visibility === "private")) throw new HttpError(404, "보드를 찾을 수 없어요");
  return board;
}

export async function resolveBoardOwner(currentUserId: string, view: "self" | "partner") {
  if (view === "self") {
    const [owner] = await getDb().select({ id: users.id, displayName: users.displayName, gender: users.gender }).from(users).where(eq(users.id, currentUserId)).limit(1);
    if (!owner) throw new HttpError(404, "보드를 찾을 수 없어요");
    return { ...owner, roleLabel: relationshipLabel(owner.gender), canEdit: true, connected: Boolean(await getActiveCouple(currentUserId)) };
  }
  const active = await getActiveCouple(currentUserId);
  if (!active) throw new HttpError(404, "연인의 보드를 볼 수 없어요");
  return { ...active.partner, canEdit: false, connected: true };
}

export async function canViewBoardOwner(currentUserId: string, ownerId: string): Promise<boolean> {
  if (currentUserId === ownerId) return true;
  const active = await getActiveCouple(currentUserId);
  return active?.partner.id === ownerId;
}

export async function loadMemorySummaries(userId: string, requestedIds?: readonly string[]): Promise<BoardMemorySummary[]> {
  if (requestedIds && requestedIds.length === 0) return [];
  const db = getDb();
  const coupleIds = await getAccessibleCoupleIds(userId);
  const visibility = or(
    and(isNull(memories.coupleId), eq(memories.createdBy, userId)),
    ...(coupleIds.length ? [inArray(memories.coupleId, coupleIds)] : []),
  );
  const rows = await db.select({ memory: memories, author: users, dateEvent: dateEvents, mission: missions })
    .from(memories)
    .innerJoin(users, eq(memories.createdBy, users.id))
    .leftJoin(dateEvents, eq(memories.dateEventId, dateEvents.id))
    .leftJoin(missions, eq(memories.missionId, missions.id))
    .where(and(
      visibility,
      isNull(memories.deletedAt),
      eq(memories.pendingReplacement, false),
      lte(memories.firstPinnedAt, new Date()),
      or(isNull(memories.missionId), eq(missions.isTest, false)),
      ...(requestedIds ? [inArray(memories.id, [...requestedIds])] : []),
    ))
    .orderBy(desc(memories.firstPinnedAt))
    .limit(requestedIds ? Math.max(1, requestedIds.length) : 200);
  const ids = rows.map(({ memory }) => memory.id);
  const assetRows = ids.length ? await db.select({ id: mediaAssets.id, memoryId: mediaAssets.memoryId, role: mediaAssets.role, mimeType: mediaAssets.mimeType, durationMs: mediaAssets.durationMs })
    .from(mediaAssets)
    .where(and(inArray(mediaAssets.memoryId, ids), ne(mediaAssets.role, "original"), eq(mediaAssets.processingStatus, "ready"))) : [];

  return rows.map(({ memory, author, dateEvent, mission }) => ({
    id: memory.id,
    type: memory.type,
    title: memoryDisplayTitle({
      type: memory.type,
      customTitle: memory.customTitle,
      missionTitle: mission ? getMissionTemplate(mission.templateId, mission.type).title : null,
    }),
    text: memory.text,
    emotion: memory.emotion,
    firstPinnedAt: memory.firstPinnedAt,
    author: { id: author.id, displayName: author.displayName, roleLabel: relationshipLabel(author.gender) },
    dateEvent: dateEvent && !dateEvent.deletedAt ? { id: dateEvent.id, title: dateEvent.title || "함께한 약속" } : null,
    assets: assetRows.filter((asset) => asset.memoryId === memory.id) as BoardMemorySummary["assets"],
  }));
}

export async function loadBoardArtwork(userId: string, boardId: string) {
  const db = getDb();
  const [items, threads, groups, assets] = await Promise.all([
    db.select().from(boardItems).where(eq(boardItems.boardId, boardId)).orderBy(asc(boardItems.zIndex)),
    db.select().from(boardThreads).where(eq(boardThreads.boardId, boardId)),
    db.select().from(memoryGroups).where(eq(memoryGroups.boardId, boardId)),
    db.select({ id: boardAssets.id, mimeType: boardAssets.mimeType, originalFilename: boardAssets.originalFilename, status: boardAssets.status }).from(boardAssets).where(and(eq(boardAssets.boardId, boardId), eq(boardAssets.status, "ready"))),
  ]);
  const threadIds = threads.map((thread) => thread.id);
  const threadMembers = threadIds.length ? await db.select().from(boardThreadItems).where(inArray(boardThreadItems.threadId, threadIds)).orderBy(asc(boardThreadItems.position)) : [];
  const groupIds = groups.map((group) => group.id);
  const groupMembers = groupIds.length ? await db.select().from(memoryGroupItems).where(inArray(memoryGroupItems.groupId, groupIds)).orderBy(asc(memoryGroupItems.position)) : [];
  const memoryIds = [...new Set([
    ...items.flatMap((item) => item.memoryId ? [item.memoryId] : []),
    ...groups.flatMap((group) => group.representativeMemoryId ? [group.representativeMemoryId] : []),
    ...groupMembers.map((member) => member.memoryId),
  ])];
  const memories = await loadMemorySummaries(userId, memoryIds);
  const memoryMap = new Map(memories.map((memory) => [memory.id, memory]));
  const visibleGroups = groups.map((group) => {
    const groupMemories = groupMembers.filter((member) => member.groupId === group.id).flatMap((member) => memoryMap.has(member.memoryId) ? [memoryMap.get(member.memoryId)!] : []);
    return { id: group.id, name: group.name, note: group.note, style: group.style, representative: group.representativeMemoryId ? memoryMap.get(group.representativeMemoryId) ?? null : groupMemories[0] ?? null, count: groupMemories.length, memories: groupMemories, updatedAt: group.updatedAt };
  });
  const groupMap = new Map(visibleGroups.map((group) => [group.id, group]));
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  const visibleItems = items.flatMap((item) => {
    const memory = item.memoryId ? memoryMap.get(item.memoryId) ?? null : null;
    const group = item.groupId ? groupMap.get(item.groupId) ?? null : null;
    const asset = item.assetId ? assetMap.get(item.assetId) ?? null : null;
    if (item.elementType === "memory" && !memory) return [];
    if (item.elementType === "bundle" && !group) return [];
    if (item.elementType === "image" && !asset) return [];
    return [{ ...item, memory, group, asset }];
  });
  const visibleItemIds = new Set(visibleItems.map((item) => item.id));
  return {
    items: visibleItems,
    threads: threads.map((thread) => ({ ...thread, itemIds: threadMembers.filter((member) => member.threadId === thread.id && visibleItemIds.has(member.itemId)).map((member) => member.itemId) })),
  };
}

export async function requireVisibleMemory(userId: string, memoryId: string): Promise<BoardMemorySummary> {
  const [memory] = await loadMemorySummaries(userId, [memoryId]);
  if (!memory) throw new HttpError(404, "붙일 추억을 찾을 수 없어요");
  return memory;
}
