import { describe, expect, it } from "vitest";
import { expandSeoulDayKeys, parseSeoulDateTimeInput, seoulDayKey, toSeoulDateTimeInput } from "@is2u/core/dates";

describe("Seoul date display helpers", () => {
  it("uses the Seoul calendar day rather than the UTC day", () => {
    expect(seoulDayKey("2026-07-16T15:30:00.000Z")).toBe("2026-07-17");
  });

  it("expands a cross-midnight appointment without duplicating the database row", () => {
    expect(expandSeoulDayKeys("2026-07-17T03:00:00.000Z", "2026-07-18T11:20:00.000Z")).toEqual([
      "2026-07-17",
      "2026-07-18",
    ]);
  });

  it("parses datetime-local values explicitly as Asia/Seoul", () => {
    const parsed = parseSeoulDateTimeInput("2026-07-17T12:00");
    expect(parsed?.toISOString()).toBe("2026-07-17T03:00:00.000Z");
    expect(toSeoulDateTimeInput("2026-07-17T03:00:00.000Z")).toBe("2026-07-17T12:00");
  });
});
