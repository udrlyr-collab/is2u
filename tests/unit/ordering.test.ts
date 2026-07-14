import { describe, expect, it } from "vitest";
import { appointmentView, compareAppointmentEvents, compareMissionFeed, missionDisplayAt } from "@is2u/core/ordering";

describe("home and calendar ordering", () => {
  it("sorts the unified mission timeline by arrival or completion time, newest first", () => {
    const now = new Date("2026-07-15T00:00:00.000Z");
    const items = [
      { id: "old", status: "completed" as const, scheduledAt: "2026-07-10T00:00:00.000Z", memoryCreatedAt: "2026-07-10T01:00:00.000Z" },
      { id: "current", status: "sent" as const, scheduledAt: "2026-07-12T00:00:00.000Z", sentAt: "2026-07-12T00:00:00.000Z", expiresAt: "2026-07-15T01:00:00.000Z" },
      { id: "recent", status: "completed" as const, scheduledAt: "2026-07-14T00:00:00.000Z", memoryCreatedAt: "2026-07-19T05:00:00.000Z", memoryFirstPinnedAt: "2026-07-14T05:00:00.000Z", updatedAt: "2026-07-20T05:00:00.000Z" },
    ];
    items.sort((a, b) => compareMissionFeed(a, b, now));
    expect(items.map(({ id }) => id)).toEqual(["recent", "current", "old"]);
    expect(missionDisplayAt(items[0]).toISOString()).toBe("2026-07-14T05:00:00.000Z");
  });

  it("keeps edited memories at their first pinned timeline position", () => {
    const edited = { status: "completed" as const, scheduledAt: "2026-07-10T00:00:00Z", memoryCreatedAt: "2026-07-20T00:00:00Z", memoryFirstPinnedAt: "2026-07-12T00:00:00Z", updatedAt: "2026-07-20T00:00:00Z" };
    expect(missionDisplayAt(edited).toISOString()).toBe("2026-07-12T00:00:00.000Z");
  });

  it("splits appointments by original end time and uses the requested direction", () => {
    const now = new Date("2026-07-15T00:00:00Z");
    const items = [
      { id: "cancelled-future", status: "cancelled" as const, startAt: "2026-07-21T00:00:00Z", endAt: "2026-07-21T01:00:00Z", updatedAt: "2026-07-14T00:00:00Z" },
      { id: "past-old", status: "completed" as const, startAt: "2026-07-01T00:00:00Z", endAt: "2026-07-01T01:00:00Z", updatedAt: "2026-07-01T01:00:00Z" },
      { id: "future", status: "scheduled" as const, startAt: "2026-07-20T00:00:00Z", endAt: "2026-07-20T01:00:00Z", updatedAt: "2026-07-10T00:00:00Z" },
      { id: "active", status: "active" as const, startAt: "2026-07-15T00:00:00Z", endAt: "2026-07-15T02:00:00Z", updatedAt: "2026-07-15T00:00:00Z" },
      { id: "past-recent", status: "completed" as const, startAt: "2026-07-13T00:00:00Z", endAt: "2026-07-13T01:00:00Z", updatedAt: "2026-07-13T01:00:00Z" },
    ];
    const upcoming = items.filter((item) => appointmentView(item, now) === "upcoming").sort((a, b) => compareAppointmentEvents(a, b, "upcoming"));
    const past = items.filter((item) => appointmentView(item, now) === "past").sort((a, b) => compareAppointmentEvents(a, b, "past"));
    expect(upcoming.map(({ id }) => id)).toEqual(["cancelled-future", "future", "active"]);
    expect(past.map(({ id }) => id)).toEqual(["past-recent", "past-old"]);
  });
});
