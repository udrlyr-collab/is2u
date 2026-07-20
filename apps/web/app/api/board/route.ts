import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@is2u/db/client";
import { boardAssets, memoryBoards } from "@is2u/db/schema";
import { getServerEnv } from "@is2u/core/env";
import { getMediaR2 } from "@is2u/core/r2";
import { BOARD_HEIGHT, BOARD_WIDTH, findBoard, getOrCreateBoard, loadBoardArtwork, requireOwnBoard, requireVisibleBoard, resolveBoardOwner } from "../../../lib/board";
import { requireCsrf, requireSession } from "../../../lib/auth";
import { json, readJson, withApiErrors } from "../../../lib/http";

const createSchema = z.object({
  title: z.string().trim().min(1).max(80).default("새 보드"),
  description: z.string().trim().max(300).optional().default(""),
});

const updateSchema = z.object({
  boardId: z.uuid(),
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  visibility: z.enum(["partner", "private"]).optional(),
  viewport: z.object({
    x: z.number().int().min(-2400).max(2400),
    y: z.number().int().min(-2000).max(2000),
    scale: z.number().min(0.5).max(2.4),
  }).optional(),
}).refine((value) => value.title !== undefined || value.description !== undefined || value.visibility !== undefined || value.viewport !== undefined, "바꿀 내용을 확인해 주세요");

export const GET = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  const url = new URL(request.url);
  let view: "partner" | "self" = url.searchParams.get("view") === "partner" ? "partner" : "self";
  let owner = await resolveBoardOwner(session.user.id, view);
  if (view === "self") await getOrCreateBoard(owner.id);

  if (url.searchParams.get("list") === "1") {
    const boards = await getDb().select().from(memoryBoards).where(and(eq(memoryBoards.ownerId, owner.id), ...(view === "partner" ? [eq(memoryBoards.visibility, "partner")] : []))).orderBy(desc(memoryBoards.updatedAt));
    const artwork = await Promise.all(boards.map((board) => loadBoardArtwork(session.user.id, board.id)));
    return json({
      owner,
      canEdit: view === "self",
      boards: boards.map((board, index) => ({
        id: board.id,
        title: board.title,
        description: board.description,
        visibility: board.visibility,
        updatedAt: board.updatedAt,
        itemCount: artwork[index].items.length,
        items: artwork[index].items,
        threads: artwork[index].threads,
      })),
    });
  }

  const requestedId = url.searchParams.get("boardId") ?? undefined;
  const board = requestedId ? await requireVisibleBoard(session.user.id, requestedId) : view === "self" ? await getOrCreateBoard(owner.id) : await findBoard(owner.id);
  if (board && board.ownerId !== owner.id) {
    view = board.ownerId === session.user.id ? "self" : "partner";
    owner = await resolveBoardOwner(session.user.id, view);
  }
  if (!board || board.ownerId !== owner.id) return json({ owner, canEdit: false, board: null, items: [], threads: [], width: BOARD_WIDTH, height: BOARD_HEIGHT });

  const artwork = await loadBoardArtwork(session.user.id, board.id);

  return json({
    owner,
    canEdit: board.ownerId === session.user.id,
    board: {
      id: board.id,
      title: board.title,
      description: board.description,
      visibility: board.visibility,
      viewport: { x: board.viewportX, y: board.viewportY, scale: board.zoomPermille / 1000 },
      updatedAt: board.updatedAt,
    },
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    items: artwork.items,
    threads: artwork.threads,
  });
});

export const POST = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const input = createSchema.parse(await readJson(request));
  const [board] = await getDb().insert(memoryBoards).values({ ownerId: session.user.id, title: input.title, description: input.description || null }).returning();
  return json({ board }, 201);
});

export const PATCH = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const input = updateSchema.parse(await readJson(request));
  const board = await requireOwnBoard(session.user.id, input.boardId);
  const [saved] = await getDb().update(memoryBoards).set({
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description || null } : {}),
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    ...(input.viewport ? { viewportX: input.viewport.x, viewportY: input.viewport.y, zoomPermille: Math.round(input.viewport.scale * 1000) } : {}),
    updatedAt: new Date(),
  }).where(and(eq(memoryBoards.id, board.id), eq(memoryBoards.ownerId, session.user.id))).returning();
  return json({ board: saved, viewport: { x: saved.viewportX, y: saved.viewportY, scale: saved.zoomPermille / 1000 } });
});

export const DELETE = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) return json({ error: "지울 보드를 확인해 주세요" }, 400);
  const board = await requireOwnBoard(session.user.id, id);
  const assets = await getDb().select({ storageKey: boardAssets.storageKey }).from(boardAssets).where(eq(boardAssets.boardId, board.id));
  for (let index = 0; index < assets.length; index += 1000) {
    await getMediaR2().send(new DeleteObjectsCommand({ Bucket: getServerEnv().R2_MEDIA_BUCKET, Delete: { Objects: assets.slice(index, index + 1000).map((asset) => ({ Key: asset.storageKey })), Quiet: true } }));
  }
  await getDb().delete(memoryBoards).where(and(eq(memoryBoards.id, board.id), eq(memoryBoards.ownerId, session.user.id)));
  return json({ ok: true });
});
