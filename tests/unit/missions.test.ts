import { describe, expect, it } from "vitest";
import { allowedMissionIntervals, canCreateActualMission, canDeliverActualMission, chooseMissionTemplate, chooseMissionTime, chooseMissionType, chooseRecipient, seoulWeekBounds } from "@is2u/core/missions";

describe("mission scheduling", () => {
  it("waits 20 minutes and leaves 15 minutes before the end", () => {
    const start = new Date("2026-07-18T03:00:00.000Z"); // noon in Seoul
    const end = new Date("2026-07-18T05:00:00.000Z");
    const intervals = allowedMissionIntervals(start, end);
    expect(intervals).toHaveLength(1);
    expect(intervals[0].start?.toUTC().toISO()).toBe("2026-07-18T03:20:00.000Z");
    expect(intervals[0].end?.toUTC().toISO()).toBe("2026-07-18T04:45:00.000Z");
  });

  it("does not create a window for a short date", () => {
    const start = new Date("2026-07-18T03:00:00.000Z");
    const end = new Date("2026-07-18T03:30:00.000Z");
    expect(chooseMissionTime(start, end)).toBeNull();
  });

  it("chooses deterministically inside the valid interval when random is injected", () => {
    const start = new Date("2026-07-18T03:00:00.000Z");
    const end = new Date("2026-07-18T05:00:00.000Z");
    expect(chooseMissionTime(start, end, {}, () => 0)?.toISOString()).toBe("2026-07-18T03:20:00.000Z");
  });

  it("never creates an actual mission while an appointment is still scheduled", () => {
    const now = new Date("2026-07-18T03:10:00.000Z");
    const event = { status: "scheduled" as const, isTest: false, startAt: new Date("2026-07-18T03:00:00.000Z"), endAt: new Date("2026-07-18T05:00:00.000Z"), deletedAt: null };
    expect(canCreateActualMission(event, now)).toBe(false);
    expect(canCreateActualMission({ ...event, status: "active" }, now)).toBe(true);
  });

  it("delivers only after 20 minutes and before the 15 minute end buffer", () => {
    const event = { status: "active" as const, isTest: false, startAt: new Date("2026-07-18T03:00:00.000Z"), endAt: new Date("2026-07-18T05:00:00.000Z"), deletedAt: null };
    expect(canDeliverActualMission(event, new Date("2026-07-18T03:19:59.000Z"))).toBe(false);
    expect(canDeliverActualMission(event, new Date("2026-07-18T03:20:00.000Z"))).toBe(true);
    expect(canDeliverActualMission(event, new Date("2026-07-18T04:45:01.000Z"))).toBe(false);
  });

  it("does not choose a delivery time before worker recovery time", () => {
    const chosen = chooseMissionTime(
      new Date("2026-07-18T03:00:00.000Z"),
      new Date("2026-07-18T06:00:00.000Z"),
      { notBefore: new Date("2026-07-18T04:10:00.000Z") },
      () => 0,
    );
    expect(chosen?.toISOString()).toBe("2026-07-18T04:10:00.000Z");
  });

  it("never immediately repeats a mission type", () => {
    for (let index = 0; index < 20; index += 1) expect(chooseMissionType("photo", () => index / 20)).not.toBe("photo");
  });

  it("excludes recently used templates and can constrain the input type", () => {
    expect(chooseMissionTemplate(["photo-now"], "photo", () => 0).id).not.toBe("photo-now");
    expect(chooseMissionTemplate([], "audio", () => 0).type).toBe("audio");
  });

  it("balances recipients and uses random only for a tie", () => {
    expect(chooseRecipient({ id: "a", delivered: 1 }, { id: "b", delivered: 3 })).toBe("a");
    expect(chooseRecipient({ id: "a", delivered: 2 }, { id: "b", delivered: 2 }, () => 0.8)).toBe("b");
  });

  it("calculates the week in Asia/Seoul", () => {
    const bounds = seoulWeekBounds(new Date("2026-07-19T16:00:00.000Z"));
    expect(bounds.start.toISOString()).toBe("2026-07-19T15:00:00.000Z");
    expect(bounds.end.getTime()).toBeGreaterThan(bounds.start.getTime());
  });
});
