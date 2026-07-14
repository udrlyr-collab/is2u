import { and, eq } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { mediaAssets, uploadSessions } from "@is2u/db/schema";
import { requireSession } from "../../../../lib/auth";
import { HttpError, json, withApiErrors } from "../../../../lib/http";

type Context = { params: Promise<{ id: string }> };

export const GET = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  const { id } = await context.params;
  const [row] = await getDb().select({ upload: uploadSessions, asset: mediaAssets }).from(uploadSessions).innerJoin(mediaAssets, eq(uploadSessions.assetId, mediaAssets.id)).where(and(eq(uploadSessions.id, id), eq(uploadSessions.ownerId, session.user.id))).limit(1);
  if (!row) throw new HttpError(404, "업로드를 찾을 수 없어요");
  return json(row);
});
