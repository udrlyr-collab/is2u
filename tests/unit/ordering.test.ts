import { describe, expect, it } from "vitest";
import { compareCalendarEvents, compareMissionFeed, missionDisplayAt } from "@is2u/core/ordering";

describe("home and calendar ordering", () => {
  it("puts an actionable mission above completed history and sorts history newest first", () => {
    const now = new Date("2026-07-15T00:00:00.000Z");
    const items = [
      { id: "old", status: "completed" as const, scheduledAt: "2026-07-10T00:00:00.000Z", memoryCreatedAt: "2026-07-10T01:00:00.000Z" },
      { id: "current", status: "sent" as const, scheduledAt: "2026-07-12T00:00:00.000Z", sentAt: "2026-07-12T00:00:00.000Z", expiresAt: "2026-07-15T01:00:00.000Z" },
      { id: "recent", status: "completed" as const, scheduledAt: "2026-07-14T00:00:00.000Z", memoryCreatedAt: "2026-07-14T05:00:00.000Z" },
    ];
    items.sort((a, b) => compareMissionFeed(a, b, now));
    expect(items.map(({ id }) => id)).toEqual(["current", "recent", "old"]);
    expect(missionDisplayAt(items[1]).toISOString()).toBe("2026-07-14T05:00:00.000Z");
  });

  it("orders calendar groups active, upcoming, past, cancelled with group-specific direction", () => {
    const items = [
      { id: "cancelled", status: "cancelled" as const, startAt: "2026-07-01T00:00:00Z", endAt: "2026-07-01T01:00:00Z", updatedAt: "2026-07-14T00:00:00Z" },
      { id: "past-old", status: "completed" as const, startAt: "2026-07-01T00:00:00Z", endAt: "2026-07-01T01:00:00Z", updatedAt: "2026-07-01T01:00:00Z" },
      { id: "future", status: "scheduled" as const, startAt: "2026-07-20T00:00:00Z", endAt: "2026-07-20T01:00:00Z", updatedAt: "2026-07-10T00:00:00Z" },
      { id: "active", status: "active" as const, startAt: "2026-07-15T00:00:00Z", endAt: "2026-07-15T02:00:00Z", updatedAt: "2026-07-15T00:00:00Z" },
      { id: "past-recent", status: "completed" as const, startAt: "2026-07-13T00:00:00Z", endAt: "2026-07-13T01:00:00Z", updatedAt: "2026-07-13T01:00:00Z" },
    ];
    items.sort(compareCalendarEvents);
    expect(items.map(({ id }) => id)).toEqual(["active", "future", "past-recent", "past-old", "cancelled"]);
  });
});
