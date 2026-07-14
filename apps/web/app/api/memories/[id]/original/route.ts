import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { mediaAssets, memories } from "@is2u/db/schema";
import { createOriginalDownload } from "@is2u/core/r2";
import { requireSession } from "../../../../../lib/auth";
import { HttpError, json, withApiErrors } from "../../../../../lib/http";

type Context = { params: Promise<{ id: string }> };

export const POST = withApiErrors(async (request: Request, context: Context) => {
  await requireSession(request);
  const { id } = await context.params;
  const [row] = await getDb().select({ asset: mediaAssets }).from(mediaAssets).innerJoin(memories, eq(mediaAssets.memoryId, memories.id)).where(and(eq(memories.id, id), isNull(memories.deletedAt), eq(mediaAssets.role, "original"))).limit(1);
  if (!row) throw new HttpError(404, "원본을 찾을 수 없습니다.");
  const url = await createOriginalDownload(row.asset.storageKey, row.asset.originalFilename ?? "original");
  return json({ url, expiresIn: 300 });
});
