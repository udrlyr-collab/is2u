import { describe, expect, it } from "vitest";
import mediaWorker from "./index";

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function sign(payload: Record<string, unknown>, secret: string): Promise<string> {
  const body = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${base64Url(new Uint8Array(signature))}`;
}

describe("media worker asset binding", () => {
  it("rejects a valid token used with a different asset path", async () => {
    const secret = "media-worker-test-secret";
    const token = await sign({
      assetId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      role: "preview",
      key: "previews/memory/asset/v1.bin",
      mimeType: "application/octet-stream",
      exp: Math.floor(Date.now() / 1000) + 60,
    }, secret);

    const response = await mediaWorker.fetch(
      new Request(`https://media.is2u.today/v1/33333333-3333-4333-8333-333333333333?token=${encodeURIComponent(token)}`),
      { MEDIA_TOKEN_SECRET: secret, APP_ORIGIN: "https://is2u.today", MEDIA: {} as R2Bucket },
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
  });
});
