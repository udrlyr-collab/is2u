import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@is2u/db/client";
import { mediaAssets } from "@is2u/db/schema";
import { getServerEnv } from "@is2u/core/env";
import { signMediaToken } from "@is2u/core/crypto";
import { requireSession } from "../../../../../lib/auth";
import { HttpError, json, withApiErrors } from "../../../../../lib/http";

type Context = { params: Promise<{ assetId: string }> };

export const POST = withApiErrors(async (request: Request, context: Context) => {
  const session = await requireSession(request);
  const { assetId } = await context.params;
  const [asset] = await getDb().select().from(mediaAssets).where(and(eq(mediaAssets.id, assetId), ne(mediaAssets.role, "original"), eq(mediaAssets.processingStatus, "ready"))).limit(1);
  if (!asset || asset.role === "original") throw new HttpError(404, "미디어를 찾을 수 없습니다.");
  const env = getServerEnv();
  const token = signMediaToken({
    assetId: asset.id,
    userId: session.user.id,
    role: asset.role,
    key: asset.storageKey,
    mimeType: asset.mimeType,
    exp: Math.floor(Date.now() / 1000) + 300,
  }, env.MEDIA_TOKEN_SECRET);
  return json({ url: `${env.MEDIA_URL}/v1/${asset.id}?token=${encodeURIComponent(token)}`, expiresIn: 300 });
});

