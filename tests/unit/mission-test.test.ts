import { isAdminRole } from "../../apps/web/lib/admin";
import { describe, expect, it } from "vitest";

describe("administrator access", () => {
  it("uses the account role instead of a hidden-entry flag or a fixed user id", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("user")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });
});
