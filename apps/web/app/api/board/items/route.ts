import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { and, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@is2u/db/client";
import { boardAssets, boardItems, memoryBoards } from "@is2u/db/schema";
import { getServerEnv } from "@is2u/core/env";
import { getMediaR2 } from "@is2u/core/r2";
import { BOARD_HEIGHT, BOARD_WIDTH, requireOwnBoard, requireVisibleMemory } from "../../../../lib/board";
import {
  BOARD_STICKER_IDS,
  BOARD_STORED_PAPER_SHAPE_IDS,
  BOARD_TEXT_STYLE_IDS,
  boardPaperDimensions,
  normalizeBoardPieceStyle,
} from "../../../../lib/board-style";
import { requireCsrf, requireSession } from "../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../lib/http";

const elementTypes = ["memory", "image", "note", "label", "sticker"] as const;
const safeText = z.string().trim().max(500).refine((value) => !/[<>\u0000-\u001f\u007f]/u.test(value), "일반 문자만 입력해 주세요");
const styleSchema = z.object({
  color: z.enum(["butter", "cream", "sky", "strawberry", "leaf", "lavender", "rose"]).optional(),
  attachment: z.enum(["pin", "tape", "clip", "none"]).optional(),
  shape: z.enum(BOARD_STORED_PAPER_SHAPE_IDS).optional(),
  textStyle: z.enum(BOARD_TEXT_STYLE_IDS).optional(),
  sticker: z.enum(BOARD_STICKER_IDS).optional(),
  shadow: z.enum(["none", "soft", "firm"]).optional(),
}).strict();

const createSchema = z.object({
  idempotencyKey: z.uuid().optional(),
  boardId: z.uuid(),
  elementType: z.enum(elementTypes).default("memory"),
  memoryId: z.uuid().optional(),
  assetId: z.uuid().optional(),
  textContent: safeText.optional(),
  styleJson: styleSchema.optional().default({}),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
}).superRefine((value, context) => {
  if (value.elementType === "memory" && !value.memoryId) context.addIssue({ code: "custom", message: "붙일 추억을 확인해 주세요" });
  if (value.elementType === "image" && !value.assetId) context.addIssue({ code: "custom", message: "붙일 사진을 확인해 주세요" });
  if (["note", "label"].includes(value.elementType) && !value.textContent) context.addIssue({ code: "custom", message: "메모 내용을 적어주세요" });
});

const updateSchema = z.object({
  id: z.uuid(),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  width: z.number().int().min(80).max(720).optional(),
  height: z.number().int().min(60).max(620).optional(),
  rotationTenths: z.number().int().min(-120).max(120).optional(),
  zIndex: z.number().int().min(1).max(10000).optional(),
  textContent: safeText.optional(),
  styleJson: styleSchema.optional(),
});
const batchUpdateSchema = z.object({ items: z.array(updateSchema).min(2).max(30) });

async function requireOwnedItem(userId: string, id: string) {
  const [row] = await getDb().select({ item: boardItems, ownerId: memoryBoards.ownerId }).from(boardItems)
    .innerJoin(memoryBoards, eq(boardItems.boardId, memoryBoards.id))
    .where(and(eq(boardItems.id, id), eq(memoryBoards.ownerId, userId))).limit(1);
  if (!row) throw new HttpError(404, "보드에서 붙인 조각을 찾을 수 없어요");
  return row.item;
}

export const POST = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const input = createSchema.parse(await readJson(request));
  const board = await requireOwnBoard(session.user.id, input.boardId);
  if (input.memoryId) await requireVisibleMemory(session.user.id, input.memoryId);
  if (input.assetId) {
    const [asset] = await getDb().select({ id: boardAssets.id }).from(boardAssets).where(and(eq(boardAssets.id, input.assetId), eq(boardAssets.boardId, board.id), eq(boardAssets.ownerId, session.user.id), eq(boardAssets.status, "ready"))).limit(1);
    if (!asset) throw new HttpError(404, "붙일 사진을 찾을 수 없어요");
  }
  const [top] = await getDb().select({ value: max(boardItems.zIndex) }).from(boardItems).where(eq(boardItems.boardId, board.id));
  const zIndex = Number(top?.value ?? 0) + 1;
  const image = input.elementType === "image";
  const styleJson = normalizeBoardPieceStyle(input.styleJson, input.elementType);
  if (input.elementType === "sticker") {
    styleJson.sticker ??= "sparkle";
    styleJson.attachment = "none";
  }
  const dimensions = boardPaperDimensions(input.elementType, styleJson.shape);
  try {
    const [item] = await getDb().insert(boardItems).values({
      ...(input.idempotencyKey ? { id: input.idempotencyKey } : {}),
      boardId: board.id,
      memoryId: input.memoryId ?? null,
      assetId: input.assetId ?? null,
      elementType: input.elementType,
      textContent: input.textContent ?? null,
      styleJson,
      x: Math.min(BOARD_WIDTH - 80, Math.max(0, input.x ?? 180 + (zIndex % 5) * 44)),
      y: Math.min(BOARD_HEIGHT - 60, Math.max(0, input.y ?? 180 + (zIndex % 4) * 42)),
      width: image ? 300 : dimensions.width,
      height: image ? 240 : dimensions.height,
      rotationTenths: ((zIndex % 5) - 2) * 4,
      zIndex,
    }).returning();
    return json({ item }, 201);
  } catch (error) {
    if ((error as { code?: string }).code === "23505" && input.idempotencyKey) {
      const [existing] = await getDb().select().from(boardItems).where(and(eq(boardItems.id, input.idempotencyKey), eq(boardItems.boardId, board.id))).limit(1);
      if (existing && existing.elementType === input.elementType && existing.memoryId === (input.memoryId ?? null)) return json({ item: existing });
    }
    if ((error as { code?: string }).code === "23505") throw new HttpError(409, "이미 이 보드에 붙여둔 조각이에요");
    throw error;
  }
});

export const PATCH = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const body = await readJson(request);
  const batch = batchUpdateSchema.safeParse(body);
  if (batch.success) {
    const db = getDb();
    const uniqueIds = [...new Set(batch.data.items.map((item) => item.id))];
    if (uniqueIds.length !== batch.data.items.length) throw new HttpError(400, "같은 조각이 두 번 포함되어 있어요");
    const owned = await db.select({ item: boardItems }).from(boardItems)
      .innerJoin(memoryBoards, eq(boardItems.boardId, memoryBoards.id))
      .where(and(eq(memoryBoards.ownerId, session.user.id), inArray(boardItems.id, uniqueIds)));
    if (owned.length !== uniqueIds.length) throw new HttpError(404, "옮길 조각을 모두 찾을 수 없어요");
    const boardId = owned[0].item.boardId;
    if (owned.some(({ item }) => item.boardId !== boardId)) throw new HttpError(400, "한 보드의 조각만 함께 옮길 수 있어요");
    const currentById = new Map(owned.map(({ item }) => [item.id, item]));
    const saved = await db.transaction(async (tx) => {
      const results = [];
      for (const input of batch.data.items) {
        const current = currentById.get(input.id)!;
        const width = input.width ?? current.width;
        const height = input.height ?? current.height;
        const [item] = await tx.update(boardItems).set({
          ...(input.x !== undefined ? { x: Math.min(BOARD_WIDTH - width, Math.max(0, input.x)) } : {}),
          ...(input.y !== undefined ? { y: Math.min(BOARD_HEIGHT - height, Math.max(0, input.y)) } : {}),
          ...(input.width !== undefined ? { width } : {}),
          ...(input.height !== undefined ? { height } : {}),
          ...(input.rotationTenths !== undefined ? { rotationTenths: input.rotationTenths } : {}),
          ...(input.zIndex !== undefined ? { zIndex: input.zIndex } : {}),
          ...(input.textContent !== undefined ? { textContent: input.textContent } : {}),
          ...(input.styleJson !== undefined ? { styleJson: normalizeBoardPieceStyle(input.styleJson, current.elementType) } : {}),
          updatedAt: new Date(),
        }).where(and(eq(boardItems.id, current.id), eq(boardItems.boardId, boardId))).returning();
        results.push(item);
      }
      await tx.update(memoryBoards).set({ updatedAt: new Date() }).where(eq(memoryBoards.id, boardId));
      return results;
    });
    return json({ items: saved });
  }
  const input = updateSchema.parse(body);
  const current = await requireOwnedItem(session.user.id, input.id);
  const width = input.width ?? current.width;
  const height = input.height ?? current.height;
  const [item] = await getDb().update(boardItems).set({
    ...(input.x !== undefined ? { x: Math.min(BOARD_WIDTH - width, Math.max(0, input.x)) } : {}),
    ...(input.y !== undefined ? { y: Math.min(BOARD_HEIGHT - height, Math.max(0, input.y)) } : {}),
    ...(input.width !== undefined ? { width } : {}),
    ...(input.height !== undefined ? { height } : {}),
    ...(input.rotationTenths !== undefined ? { rotationTenths: input.rotationTenths } : {}),
    ...(input.zIndex !== undefined ? { zIndex: input.zIndex } : {}),
    ...(input.textContent !== undefined ? { textContent: input.textContent } : {}),
    ...(input.styleJson !== undefined ? { styleJson: normalizeBoardPieceStyle(input.styleJson, current.elementType) } : {}),
    updatedAt: new Date(),
  }).where(and(eq(boardItems.id, current.id), eq(boardItems.boardId, current.boardId))).returning();
  await getDb().update(memoryBoards).set({ updatedAt: new Date() }).where(eq(memoryBoards.id, current.boardId));
  return json({ item });
});

export const DELETE = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) throw new HttpError(400, "떼어낼 조각을 확인해 주세요");
  const current = await requireOwnedItem(session.user.id, id);
  const [asset] = current.assetId ? await getDb().select().from(boardAssets).where(and(eq(boardAssets.id, current.assetId), eq(boardAssets.ownerId, session.user.id))).limit(1) : [];
  await getDb().delete(boardItems).where(and(eq(boardItems.id, current.id), eq(boardItems.boardId, current.boardId)));
  if (asset) {
    await getMediaR2().send(new DeleteObjectCommand({ Bucket: getServerEnv().R2_MEDIA_BUCKET, Key: asset.storageKey }));
    await getDb().delete(boardAssets).where(eq(boardAssets.id, asset.id));
  }
  await getDb().update(memoryBoards).set({ updatedAt: new Date() }).where(eq(memoryBoards.id, current.boardId));
  return json({ ok: true });
});
