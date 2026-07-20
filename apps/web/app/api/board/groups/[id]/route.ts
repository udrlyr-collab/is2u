import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@is2u/db/client";
import { memoryBoards, memoryGroupItems, memoryGroups } from "@is2u/db/schema";
import { canViewBoardOwner, loadMemorySummaries } from "../../../../../lib/board";
import { requireCsrf, requireSession } from "../../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../../lib/http";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(30),
  note: z.string().trim().max(200),
  style: z.enum(["butter", "cream", "strawberry", "lavender", "rose", "sky", "leaf"]),
  memoryIds: z.array(z.uuid()).min(1).max(100),
  representativeMemoryId: z.uuid().nullable(),
});

async function loadGroup(id: string) {
  const [row] = await getDb().select({ group: memoryGroups, boardOwnerId: memoryBoards.ownerId }).from(memoryGroups)
    .innerJoin(memoryBoards, eq(memoryGroups.boardId, memoryBoards.id))
    .where(eq(memoryGroups.id, id)).limit(1);
  if (!row) throw new HttpError(404, "추억 그룹을 찾을 수 없어요");
  return row;
}

export const GET = withApiErrors(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const session = await requireSession(request);
  const { id } = await context.params;
  const row = await loadGroup(id);
  if (!await canViewBoardOwner(session.user.id, row.boardOwnerId)) throw new HttpError(404, "추억 그룹을 찾을 수 없어요");
  const members = await getDb().select().from(memoryGroupItems).where(eq(memoryGroupItems.groupId, id)).orderBy(asc(memoryGroupItems.position));
  const summaries = await loadMemorySummaries(session.user.id, members.map((member) => member.memoryId));
  const summaryMap = new Map(summaries.map((memory) => [memory.id, memory]));
  return json({
    group: row.group,
    canEdit: row.boardOwnerId === session.user.id,
    memories: members.flatMap((member) => summaryMap.has(member.memoryId) ? [{ ...summaryMap.get(member.memoryId)!, position: member.position }] : []),
  });
});

export const PATCH = withApiErrors(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const row = await loadGroup(id);
  if (row.boardOwnerId !== session.user.id) throw new HttpError(403, "연인의 그룹은 바꿀 수 없어요");
  const input = updateSchema.parse(await readJson(request));
  const memoryIds = [...new Set(input.memoryIds)];
  const visible = await loadMemorySummaries(session.user.id, memoryIds);
  if (visible.length !== memoryIds.length) throw new HttpError(404, "그룹에 넣을 추억을 모두 찾을 수 없어요");
  const representativeMemoryId = input.representativeMemoryId && memoryIds.includes(input.representativeMemoryId) ? input.representativeMemoryId : memoryIds[0];
  const db = getDb();
  const group = await db.transaction(async (tx) => {
    const [saved] = await tx.update(memoryGroups).set({ name: input.name, note: input.note || null, style: input.style, representativeMemoryId, updatedAt: new Date() })
      .where(and(eq(memoryGroups.id, id), eq(memoryGroups.ownerId, session.user.id))).returning();
    await tx.delete(memoryGroupItems).where(eq(memoryGroupItems.groupId, id));
    await tx.insert(memoryGroupItems).values(memoryIds.map((memoryId, position) => ({ groupId: id, memoryId, position })));
    return saved;
  });
  return json({ group });
});

export const DELETE = withApiErrors(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  const row = await loadGroup(id);
  if (row.boardOwnerId !== session.user.id) throw new HttpError(403, "연인의 그룹은 떼어낼 수 없어요");
  await getDb().delete(memoryGroups).where(and(eq(memoryGroups.id, id), eq(memoryGroups.ownerId, session.user.id)));
  return json({ ok: true });
});
