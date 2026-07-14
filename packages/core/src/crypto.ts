import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function keyedHash(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export type MediaTokenPayload = {
  assetId: string;
  userId: string;
  role: "preview" | "thumbnail" | "poster";
  key: string;
  mimeType: string;
  exp: number;
};

export function signMediaToken(payload: MediaTokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyMediaToken(token: string, secret: string, now = Date.now()): MediaTokenPayload | null {
  const [body, supplied] = token.split(".");
  if (!body || !supplied) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const suppliedBuffer = Buffer.from(supplied, "base64url");
  if (expected.length !== suppliedBuffer.length || !timingSafeEqual(expected, suppliedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as MediaTokenPayload;
    if (!payload.assetId || !payload.userId || !payload.key || payload.exp * 1000 <= now) return null;
    if (!(["preview", "thumbnail", "poster"] as const).includes(payload.role)) return null;
    return payload;
  } catch {
    return null;
  }
}

