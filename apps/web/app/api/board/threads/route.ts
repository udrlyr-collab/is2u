import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@is2u/db/client";
import { boardItems, boardThreadItems, boardThreads, memoryBoards } from "@is2u/db/schema";
import { BOARD_HEIGHT, BOARD_WIDTH, requireOwnBoard } from "../../../../lib/board";
import { requireCsrf, requireSession } from "../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../lib/http";

const colors = ["warm-brown", "cream", "strawberry", "sky", "leaf", "lavender", "dark-brown", "beige", "brown", "yellow", "muted-red"] as const;
const createSchema = z.object({
  boardId: z.uuid(),
  startX: z.number().int().min(0).max(BOARD_WIDTH),
  startY: z.number().int().min(0).max(BOARD_HEIGHT),
  endX: z.number().int().min(0).max(BOARD_WIDTH),
  endY: z.number().int().min(0).max(BOARD_HEIGHT),
  color: z.enum(colors).default("warm-brown"),
  mode: z.enum(["hanging", "linking"]).default("hanging"),
  itemIds: z.array(z.uuid()).min(2, "연결할 사진을 두 장 이상 골라주세요").max(30),
}).refine((value) => Math.hypot(value.endX - value.startX, value.endY - value.startY) >= 120, "실은 조금 더 길게 걸어주세요");

const updateSchema = z.object({
  id: z.uuid(),
  itemIds: z.array(z.uuid()).min(2, "실에는 두 장 이상 연결해 주세요").max(30).optional(),
  color: z.enum(colors).optional(),
  curve: z.number().int().min(-160).max(160).optional(),
  mode: z.enum(["hanging", "linking"]).optional(),
  startX: z.number().int().min(0).max(BOARD_WIDTH).optional(),
  startY: z.number().int().min(0).max(BOARD_HEIGHT).optional(),
  endX: z.number().int().min(0).max(BOARD_WIDTH).optional(),
  endY: z.number().int().min(0).max(BOARD_HEIGHT).optional(),
});

async function requireOwnedThread(userId: string, id: string) {
  const [row] = await getDb().select({ thread: boardThreads, ownerId: memoryBoards.ownerId }).from(boardThreads)
    .innerJoin(memoryBoards, eq(boardThreads.boardId, memoryBoards.id))
    .where(and(eq(boardThreads.id, id), eq(memoryBoards.ownerId, userId))).limit(1);
  if (!row) throw new HttpError(404, "실을 찾을 수 없어요");
  return row.thread;
}

export const POST = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const input = createSchema.parse(await readJson(request));
  const board = await requireOwnBoard(session.user.id, input.boardId);
  const itemIds = [...new Set(input.itemIds)];
  const visible = await getDb().select({ id: boardItems.id, elementType: boardItems.elementType }).from(boardItems).where(and(eq(boardItems.boardId, board.id), inArray(boardItems.id, itemIds)));
  if (visible.length !== itemIds.length || visible.some((item) => !["image", "memory"].includes(item.elementType))) throw new HttpError(404, "연결할 사진과 추억을 찾을 수 없어요");
  const curve = Math.min(120, Math.max(24, Math.round(Math.abs(input.endX - input.startX) / 12)));
  const thread = await getDb().transaction(async (tx) => {
    const [created] = await tx.insert(boardThreads).values({ boardId: board.id, startX: input.startX, startY: input.startY, endX: input.endX, endY: input.endY, curve, color: input.color, mode: input.mode }).returning();
    await tx.insert(boardThreadItems).values(itemIds.map((itemId, position) => ({ threadId: created.id, itemId, position })));
    return created;
  });
  await getDb().update(memoryBoards).set({ updatedAt: new Date() }).where(eq(memoryBoards.id, board.id));
  return json({ thread: { ...thread, itemIds } }, 201);
});

export const PATCH = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const input = updateSchema.parse(await readJson(request));
  const thread = await requireOwnedThread(session.user.id, input.id);
  const db = getDb();
  if (input.itemIds) {
    const itemIds = [...new Set(input.itemIds)];
    const visible = itemIds.length ? await db.select({ id: boardItems.id }).from(boardItems).where(and(eq(boardItems.boardId, thread.boardId), inArray(boardItems.id, itemIds))) : [];
    if (visible.length !== itemIds.length) throw new HttpError(404, "실에 걸 추억을 찾을 수 없어요");
    const previousMembers = await db.select().from(boardThreadItems).where(eq(boardThreadItems.threadId, thread.id));
    const removedIds = previousMembers.map((member) => member.itemId).filter((id) => !itemIds.includes(id));
    await db.transaction(async (tx) => {
      await tx.delete(boardThreadItems).where(eq(boardThreadItems.threadId, thread.id));
      if (itemIds.length) await tx.insert(boardThreadItems).values(itemIds.map((itemId, position) => ({ threadId: thread.id, itemId, position })));
      if (thread.mode === "hanging" && removedIds.length) {
        const removed = await tx.select().from(boardItems).where(inArray(boardItems.id, removedIds));
        for (const item of removed) await tx.update(boardItems).set({ styleJson: { ...item.styleJson, attachment: "pin" }, updatedAt: new Date() }).where(eq(boardItems.id, item.id));
      }
    });
  }
  const [saved] = await db.update(boardThreads).set({
    ...(input.color ? { color: input.color } : {}),
    ...(input.curve !== undefined ? { curve: input.curve } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.startX !== undefined ? { startX: input.startX } : {}),
    ...(input.startY !== undefined ? { startY: input.startY } : {}),
    ...(input.endX !== undefined ? { endX: input.endX } : {}),
    ...(input.endY !== undefined ? { endY: input.endY } : {}),
  }).where(eq(boardThreads.id, thread.id)).returning();
  const members = await db.select().from(boardThreadItems).where(eq(boardThreadItems.threadId, thread.id));
  await db.update(memoryBoards).set({ updatedAt: new Date() }).where(eq(memoryBoards.id, thread.boardId));
  return json({ thread: { ...saved, itemIds: members.sort((a, b) => a.position - b.position).map((member) => member.itemId) } });
});

export const DELETE = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) throw new HttpError(400, "떼어낼 실을 확인해 주세요");
  const thread = await requireOwnedThread(session.user.id, id);
  const db = getDb();
  await db.transaction(async (tx) => {
    if (thread.mode === "hanging") {
      const members = await tx.select({ item: boardItems }).from(boardThreadItems).innerJoin(boardItems, eq(boardThreadItems.itemId, boardItems.id)).where(eq(boardThreadItems.threadId, thread.id));
      for (const { item } of members) await tx.update(boardItems).set({ styleJson: { ...item.styleJson, attachment: "pin" }, updatedAt: new Date() }).where(eq(boardItems.id, item.id));
    }
    await tx.delete(boardThreads).where(eq(boardThreads.id, thread.id));
    await tx.update(memoryBoards).set({ updatedAt: new Date() }).where(eq(memoryBoards.id, thread.boardId));
  });
  return json({ ok: true });
});
