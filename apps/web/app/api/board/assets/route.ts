import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "@is2u/db/client";
import { boardAssets } from "@is2u/db/schema";
import { createSingleUpload } from "@is2u/core/r2";
import { safeExtension } from "@is2u/core/validation";
import { requireOwnBoard } from "../../../../lib/board";
import { requireCsrf, requireSession } from "../../../../lib/auth";
import { HttpError, json, readJson, withApiErrors } from "../../../../lib/http";

const MAX_BOARD_IMAGE_BYTES = 25 * 1024 * 1024;
const schema = z.object({
  boardId: z.uuid(),
  filename: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  size: z.number().int().positive().max(MAX_BOARD_IMAGE_BYTES),
});

export const POST = withApiErrors(async (request: Request) => {
  const session = await requireSession(request);
  await requireCsrf(request, session);
  const input = schema.parse(await readJson(request));
  const board = await requireOwnBoard(session.user.id, input.boardId);
  if (input.size > MAX_BOARD_IMAGE_BYTES) throw new HttpError(413, "사진은 25MB까지 붙일 수 있어요");
  const id = randomUUID();
  const storageKey = `boards/${board.id}/${id}/source.${safeExtension(input.filename, input.mimeType)}`;
  const [asset] = await getDb().insert(boardAssets).values({ id, boardId: board.id, ownerId: session.user.id, storageKey, originalFilename: input.filename, mimeType: input.mimeType, fileSize: input.size }).returning();
  return json({ asset: { id: asset.id }, url: await createSingleUpload(storageKey, input.mimeType), expiresIn: 900 }, 201);
});
