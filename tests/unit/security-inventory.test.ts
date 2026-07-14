import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("secret inventory", () => {
  it("keeps deployment examples free of PIN values and permanent credentials", async () => {
    const publicExample = await readFile(".env.example", "utf8");
    expect(publicExample).not.toContain("PIN_HASH=");
    expect(publicExample).not.toContain("SECRET_ACCESS_KEY=");
    expect(publicExample).not.toContain("API_TOKEN=");
  });

  it("keeps raw secret file directories ignored by git", async () => {
    const gitignore = await readFile(".gitignore", "utf8");
    expect(gitignore).toContain("cloudflare/");
    expect(gitignore).toContain("ssh/");
    expect(gitignore).toContain(".env");
  });
});
