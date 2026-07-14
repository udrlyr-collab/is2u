import { FIXED_USERS } from "@is2u/core/types";
import { isMissionTestEnabledForUser } from "../../apps/web/lib/mission-test";
import { describe, expect, it } from "vitest";

describe("production mission test access", () => {
  it("allows only Hong Seongmin when the server flag is enabled", () => {
    expect(isMissionTestEnabledForUser(FIXED_USERS.seongmin.id, "true")).toBe(true);
    expect(isMissionTestEnabledForUser(FIXED_USERS.seoyeong.id, "true")).toBe(false);
    expect(isMissionTestEnabledForUser(null, "true")).toBe(false);
  });

  it("disables access for every user when the server flag is off", () => {
    expect(isMissionTestEnabledForUser(FIXED_USERS.seongmin.id, "false")).toBe(false);
  });
});
