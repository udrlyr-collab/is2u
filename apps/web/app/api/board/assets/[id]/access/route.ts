import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@is2u/db/client";
import { boardAssets } from "@is2u/db/schema";
import { createBoardAssetView } from "@is2u/core/r2";
import { requireVisibleBoard } from "../../../../../../lib/board";
import { requireSession } from "../../../../../../lib/auth";
import { HttpError, json, withApiErrors } from "../../../../../../lib/http";

type Context = { params: Promise<{ id: string }> };
export const POST = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "사진을 찾을 수 없어요");
  const [asset] = await getDb().select().from(boardAssets).where(and(eq(boardAssets.id, id), eq(boardAssets.status, "ready"))).limit(1);
  if (!asset) throw new HttpError(404, "사진을 찾을 수 없어요");
  await requireVisibleBoard(session.user.id, asset.boardId);
  return json({ url: await createBoardAssetView(asset.storageKey), expiresIn: 600 });
});
