import { describe, expect, it } from "vitest";
import { signMediaToken, verifyMediaToken } from "@is2u/core/crypto";

describe("private media tokens", () => {
  const secret = "a-secure-test-secret-that-is-long-enough";
  const payload = { assetId: "asset", userId: "user", role: "preview" as const, key: "previews/memory/asset/v1.mp4", mimeType: "video/mp4", exp: 2_000_000_000 };

  it("accepts an intact unexpired token", () => {
    const token = signMediaToken(payload, secret);
    expect(verifyMediaToken(token, secret, 1_900_000_000_000)).toEqual(payload);
  });

  it("rejects tampering and expiration", () => {
    const token = signMediaToken(payload, secret);
    expect(verifyMediaToken(`${token}x`, secret, 1_900_000_000_000)).toBeNull();
    expect(verifyMediaToken(token, secret, 2_100_000_000_000)).toBeNull();
  });
});

