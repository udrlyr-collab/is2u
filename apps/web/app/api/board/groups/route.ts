import { eq, max } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@is2u/db/client";
import { boardItems, memoryBoards, memoryGroupItems, memoryGroups } from "@is2u/db/schema";
import { requireOwnBoard, loadMemorySummaries } from "../../../../lib/board";
import { requireCsrf, requireSession } from "../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../lib/http";

const groupSchema = z.object({
  boardId: z.uuid(),
  name: z.string().trim().min(1, "번들 이름을 적어주세요").max(30),
  note: z.string().trim().max(200).optional(),
  style: z.enum(["butter", "cream", "strawberry", "lavender", "rose", "sky", "leaf"]).default("butter"),
  memoryIds: z.array(z.uuid()).min(1, "추억을 하나 이상 골라주세요").max(100),
  representativeMemoryId: z.uuid().nullable().optional(),
});

export const POST = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const input = groupSchema.parse(await readJson(request));
  const memoryIds = [...new Set(input.memoryIds)];
  const visible = await loadMemorySummaries(session.user.id, memoryIds);
  if (visible.length !== memoryIds.length) throw new HttpError(404, "그룹에 넣을 추억을 모두 찾을 수 없어요");
  const representativeMemoryId = input.representativeMemoryId && memoryIds.includes(input.representativeMemoryId) ? input.representativeMemoryId : memoryIds[0];
  const board = await requireOwnBoard(session.user.id, input.boardId);
  const db = getDb();
  const [top] = await db.select({ value: max(boardItems.zIndex) }).from(boardItems).where(eq(boardItems.boardId, board.id));
  const zIndex = Number(top?.value ?? 0) + 1;
  const created = await db.transaction(async (tx) => {
    const [group] = await tx.insert(memoryGroups).values({
      boardId: board.id,
      ownerId: session.user.id,
      name: input.name,
      note: input.note || null,
      style: input.style,
      representativeMemoryId,
    }).returning();
    await tx.insert(memoryGroupItems).values(memoryIds.map((memoryId, position) => ({ groupId: group.id, memoryId, position })));
    const [item] = await tx.insert(boardItems).values({
      boardId: board.id,
      groupId: group.id,
      elementType: "bundle",
      x: 150 + (zIndex % 5) * 40,
      y: 150 + (zIndex % 4) * 36,
      width: 260,
      height: 210,
      rotationTenths: ((zIndex % 5) - 2) * 3,
      zIndex,
    }).returning();
    return { group, item };
  });
  await db.update(memoryBoards).set({ updatedAt: new Date() }).where(eq(memoryBoards.id, board.id));
  return json(created, 201);
});
