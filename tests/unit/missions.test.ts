import { describe, expect, it } from "vitest";
import { allowedMissionIntervals, canCreateActualMission, canDeliverActualMission, chooseMissionTemplate, chooseMissionTime, chooseMissionTimeInRange, chooseMissionType, chooseRecipient, chooseTestMissionTemplate, seoulWeekBounds } from "@is2u/core/missions";
import { ACTIVE_MISSION_TEMPLATES, LEGACY_MISSION_TEMPLATES, MISSION_TYPE_WEIGHTS, getMissionTemplate } from "@is2u/core/types";

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

  it("chooses the next mission within the shared minimum and maximum interval", () => {
    const chosen = chooseMissionTimeInRange(
      new Date("2026-07-18T03:00:00.000Z"),
      new Date("2026-07-18T07:00:00.000Z"),
      new Date("2026-07-18T03:20:00.000Z"),
      40,
      90,
      {},
      () => 0.5,
    );
    expect(chosen?.toISOString()).toBe("2026-07-18T04:25:00.000Z");
  });

  it("never immediately repeats a mission type", () => {
    for (let index = 0; index < 20; index += 1) expect(chooseMissionType("photo", () => index / 20)).not.toBe("photo");
  });

  it("excludes recently used templates and can constrain the input type", () => {
    expect(chooseMissionTemplate(["photo-present-scene"], "photo", () => 0).id).not.toBe("photo-present-scene");
    expect(chooseMissionTemplate([], "audio", () => 0).type).toBe("audio");
  });

  it("uses exactly the requested 14 active templates and keeps 48 legacy templates inactive", () => {
    expect(ACTIVE_MISSION_TEMPLATES).toHaveLength(14);
    expect(LEGACY_MISSION_TEMPLATES).toHaveLength(48);
    expect(LEGACY_MISSION_TEMPLATES.every((item) => !item.enabled)).toBe(true);
    expect(getMissionTemplate("photo-hands", "photo").title).toBe("마주 잡은 손");
    expect(Object.fromEntries(["audio", "photo", "video", "text", "emotion"].map((type) => [type, ACTIVE_MISSION_TEMPLATES.filter((item) => item.type === type).length]))).toEqual({ audio: 3, photo: 3, video: 2, text: 4, emotion: 2 });
    expect(ACTIVE_MISSION_TEMPLATES.map(({ id, title, prompt }) => ({ id, title, prompt }))).toEqual([
      { id: "audio-current-sound", title: "지금의 소리", prompt: "지금 이 순간의 소리를 잠깐 남겨주세요." },
      { id: "audio-memorable-voice", title: "기억할 목소리", prompt: "지금 남기고 싶은 말을 짧게 들려주세요." },
      { id: "audio-our-words", title: "우리의 한마디", prompt: "둘의 목소리가 담긴 순간을 남겨주세요." },
      { id: "photo-present-scene", title: "눈앞의 순간", prompt: "지금 기억하고 싶은 장면을 한 장 남겨주세요." },
      { id: "photo-piece-of-today", title: "오늘의 조각", prompt: "오늘을 떠올리게 할 무언가를 찍어주세요." },
      { id: "photo-us-now", title: "지금의 우리", prompt: "지금 둘의 순간을 자유롭게 남겨주세요." },
      { id: "video-brief-movement", title: "잠깐의 움직임", prompt: "지금의 순간을 짧은 영상으로 남겨주세요." },
      { id: "video-our-few-seconds", title: "우리의 몇 초", prompt: "나중에 다시 보고 싶은 몇 초를 담아주세요." },
      { id: "text-memorable-words", title: "기억할 한마디", prompt: "지금 기억하고 싶은 말을 남겨주세요." },
      { id: "text-todays-line", title: "오늘의 한 줄", prompt: "오늘을 한 줄로 남겨주세요." },
      { id: "text-title-of-now", title: "지금의 제목", prompt: "이 순간에 제목을 붙여주세요." },
      { id: "text-next-us", title: "다음의 우리", prompt: "함께하고 싶은 다음 순간을 남겨주세요." },
      { id: "emotion-current-heart", title: "지금의 마음", prompt: "지금 가장 가까운 마음을 골라주세요." },
      { id: "emotion-our-atmosphere", title: "둘의 분위기", prompt: "지금 둘 사이의 분위기를 골라주세요." },
    ]);
  });

  it("prevents immediate template repeats and a third consecutive category", () => {
    expect(chooseMissionTemplate(["text-memorable-words"], "text", () => 0).id).not.toBe("text-memorable-words");
    expect(chooseMissionTemplate(["photo-present-scene", "photo-piece-of-today"], null, () => 0).type).not.toBe("photo");
  });

  it("uses the configured 20/20/10/30/20 category weights", () => {
    expect(MISSION_TYPE_WEIGHTS).toEqual({ audio: 0.2, photo: 0.2, video: 0.1, text: 0.3, emotion: 0.2 });
  });

  it("derives mission checks from all five active categories", () => {
    expect(chooseTestMissionTemplate("video", null, () => 0).id).toBe("video-brief-movement");
    expect(chooseTestMissionTemplate("photo", "photo-us-now", () => 0).prompt).toBe("지금 둘의 순간을 자유롭게 남겨주세요.");
    expect(chooseTestMissionTemplate("audio", null, () => 0).id).toBe("audio-current-sound");
    expect(chooseTestMissionTemplate("emotion", null, () => 0).id).toBe("emotion-current-heart");
    expect(chooseTestMissionTemplate(null, null, () => 0).type).toBe("video");
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
