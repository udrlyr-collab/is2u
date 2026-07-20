import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@is2u/db/client";
import { boardAssets, boardItems, memoryBoards } from "@is2u/db/schema";
import { headMediaObject } from "@is2u/core/r2";
import { BOARD_HEIGHT, BOARD_WIDTH, requireOwnBoard } from "../../../../../../lib/board";
import { requireCsrf, requireSession } from "../../../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../../../lib/http";

const schema = z.object({ x: z.number().int().optional(), y: z.number().int().optional() });
type Context = { params: Promise<{ id: string }> };

export const POST = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(400, "사진을 확인해 주세요");
  const input = schema.parse(await readJson(request));
  const [asset] = await getDb().select().from(boardAssets).where(and(eq(boardAssets.id, id), eq(boardAssets.ownerId, session.user.id))).limit(1);
  if (!asset) throw new HttpError(404, "사진을 찾을 수 없어요");
  const board = await requireOwnBoard(session.user.id, asset.boardId);
  const [existingItem] = await getDb().select().from(boardItems).where(and(eq(boardItems.boardId, board.id), eq(boardItems.assetId, asset.id))).limit(1);
  if (asset.status === "ready" && existingItem) return json({ asset, item: existingItem });
  const head = await headMediaObject(asset.storageKey);
  if (Number(head.ContentLength ?? -1) !== asset.fileSize || (head.ContentType && head.ContentType !== asset.mimeType)) throw new HttpError(400, "올린 사진 정보를 확인할 수 없어요");
  const db = getDb();
  const [top] = await db.select({ value: max(boardItems.zIndex) }).from(boardItems).where(eq(boardItems.boardId, board.id));
  const zIndex = Number(top?.value ?? 0) + 1;
  const created = await db.transaction(async (tx) => {
    const [ready] = await tx.update(boardAssets).set({ status: "ready", updatedAt: new Date() }).where(eq(boardAssets.id, asset.id)).returning();
    const [item] = await tx.insert(boardItems).values({ boardId: board.id, assetId: asset.id, elementType: "image", x: Math.min(BOARD_WIDTH - 300, Math.max(0, input.x ?? 220)), y: Math.min(BOARD_HEIGHT - 240, Math.max(0, input.y ?? 220)), width: 300, height: 240, rotationTenths: ((zIndex % 5) - 2) * 4, zIndex, styleJson: { attachment: asset.mimeType === "image/png" ? "none" : "clip", shadow: "soft" } }).returning();
    await tx.update(memoryBoards).set({ updatedAt: new Date() }).where(eq(memoryBoards.id, board.id));
    return { asset: ready, item };
  });
  return json(created);
});
