import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { relationshipLabel } from "@is2u/core/types";
import { adminCoupleDisconnectSchema, adminUserActionSchema, accountNameSchema, accountUpdateSchema, coupleDisconnectSchema, loginSchema, signupSchema, usernameSchema } from "@is2u/core/validation";
import { invitationPairKey } from "../../apps/web/lib/couples";

describe("account input rules", () => {
  it("normalizes usernames and accepts only the documented alphabet", () => {
    expect(usernameSchema.parse("  My_Name1 ")).toBe("my_name1");
    expect(() => usernameSchema.parse("가나다라")).toThrow();
    expect(() => usernameSchema.parse("abc")).toThrow();
  });

  it("validates names and password confirmation", () => {
    expect(accountNameSchema.parse(" 홍 성민 ")).toBe("홍 성민");
    expect(() => accountNameSchema.parse("<script>")).toThrow();
    expect(() => signupSchema.parse({ displayName: "새 사용자", username: "new_user", password: "safe-note-2026", passwordConfirm: "different-note", gender: "male" })).toThrow();
    expect(() => signupSchema.parse({ displayName: "새 사용자", username: "new_user", password: "12345678", passwordConfirm: "12345678", gender: "female" })).toThrow();
  });

  it("does not accept legacy PIN bodies as a normal login", () => {
    expect(() => loginSchema.parse({ pin: "1234" })).toThrow();
    expect(loginSchema.parse({ username: "KEEPER_1", password: "a password" }).username).toBe("keeper_1");
  });

  it("keeps usernames immutable after signup", () => {
    expect(accountUpdateSchema.parse({ displayName: "홍성민", gender: "male" })).toEqual({ displayName: "홍성민", gender: "male" });
    expect(() => accountUpdateSchema.parse({ displayName: "홍성민", gender: "male", username: "changed_id" })).toThrow();
  });

  it("requires exact confirmation values for destructive account and connection actions", () => {
    expect(adminUserActionSchema.parse({ action: "delete", username: "target_user" })).toEqual({ action: "delete", username: "target_user" });
    expect(() => adminUserActionSchema.parse({ action: "delete", username: "x" })).toThrow();
    expect(() => coupleDisconnectSchema.parse({ password: "secret", phrase: "다른 문구" })).toThrow();
    expect(adminCoupleDisconnectSchema.parse({ action: "disconnect", reason: "operations", phrase: "연결을 정리할게요" }).reason).toBe("operations");
    expect(() => adminCoupleDisconnectSchema.parse({ action: "disconnect", reason: "custom", phrase: "연결을 정리할게요" })).toThrow();
  });
});

describe("couple identity rules", () => {
  it("builds the same pending-invitation key in both directions", () => {
    expect(invitationPairKey("b", "a")).toBe(invitationPairKey("a", "b"));
  });

  it("derives relationship labels from gender", () => {
    expect(relationshipLabel("male")).toBe("남자친구");
    expect(relationshipLabel("female")).toBe("여자친구");
  });

  it("keeps legacy rows on the deterministic migrated couple", async () => {
    const migration = await readFile("packages/db/migrations/0009_sudden_mauler.sql", "utf8");
    expect(migration).toContain("7f88cb2e-6f6d-4bfd-a0a5-7d55c31f3cd1");
    expect(migration).toContain('UPDATE "date_events" SET "couple_id"');
    expect(migration).toContain('UPDATE "missions" SET "couple_id"');
    expect(migration).toContain('UPDATE "memories" SET "couple_id"');
  });

  it("recognizes an active legacy partner before that partner has an account username", async () => {
    const couples = await readFile("apps/web/lib/couples.ts", "utf8");
    expect(couples).toContain("if (!partner) return null");
    expect(couples).not.toContain("if (!partner?.username) return null");
    expect(couples).toContain("username: string | null");
  });
});
