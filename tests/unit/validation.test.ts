import { describe, expect, it } from "vitest";
import { dateEventCreateSchema, dateEventSchema, memoryEditSchema, memoryReplacementSchema, memoryTitleSchema, missionCompletionSchema, safeExtension } from "@is2u/core/validation";
import { EMOTIONS, memoryDisplayTitle } from "@is2u/core/types";

describe("input validation", () => {
  it("rejects an inverted date range", () => {
    expect(() => dateEventSchema.parse({ startAt: "2026-07-20T10:00:00Z", endAt: "2026-07-20T09:00:00Z" })).toThrow();
  });

  it("requires a client request id for retry-safe date creation", () => {
    expect(() => dateEventCreateSchema.parse({
      startAt: "2026-07-20T09:00:00Z",
      endAt: "2026-07-20T10:00:00Z",
    })).toThrow();
    expect(dateEventCreateSchema.parse({
      startAt: "2026-07-20T09:00:00Z",
      endAt: "2026-07-20T10:00:00Z",
      clientRequestId: crypto.randomUUID(),
    }).clientRequestId).toBeTypeOf("string");
  });

  it("requires content for text and emotion missions", () => {
    expect(() => missionCompletionSchema.parse({ memoryType: "text", idempotencyKey: crypto.randomUUID() })).toThrow();
    expect(() => missionCompletionSchema.parse({ memoryType: "emotion", idempotencyKey: crypto.randomUUID() })).toThrow();
  });

  it("accepts one structured or custom emotion and rejects HTML-like technical text", () => {
    const common = { memoryType: "emotion" as const, idempotencyKey: crypto.randomUUID() };
    expect(missionCompletionSchema.parse({ ...common, emotionId: EMOTIONS[0].id }).emotionId).toBe(EMOTIONS[0].id);
    expect(missionCompletionSchema.parse({ ...common, customEmotion: "말로 설명하기 어려운데 그냥 좋아" }).customEmotion).toContain("그냥 좋아");
    expect(() => missionCompletionSchema.parse({ ...common, emotionId: EMOTIONS[0].id, customEmotion: "둘 다" })).toThrow();
    expect(() => missionCompletionSchema.parse({ ...common, customEmotion: "<script>alert(1)</script>" })).toThrow();
    expect(() => missionCompletionSchema.parse({ ...common, customEmotion: "https://example.com" })).toThrow();
  });

  it("normalizes unsafe extensions", () => {
    expect(safeExtension("moment.MP4", "video/mp4")).toBe("mp4");
    expect(safeExtension("no-extension", "image/jpeg")).toBe("jpg");
  });

  it("trims optional memory titles, limits them to 30 characters, and rejects markup", () => {
    expect(memoryTitleSchema.parse("  여름의 오후  ")).toBe("여름의 오후");
    expect(memoryTitleSchema.parse("   ")).toBeNull();
    expect(memoryTitleSchema.parse("우리의 여름 & 가을 \"기록\"")).toContain("&");
    expect(() => memoryTitleSchema.parse("가".repeat(31))).toThrow();
    expect(() => memoryTitleSchema.parse("<script>alert(1)</script>")).toThrow();
  });

  it("uses one title priority for direct and mission memories", () => {
    expect(memoryDisplayTitle({ type: "photo", customTitle: "직접 붙인 제목", missionTitle: "미션 제목" })).toBe("직접 붙인 제목");
    expect(memoryDisplayTitle({ type: "photo", customTitle: null, missionTitle: "미션 제목" })).toBe("미션 제목");
    expect(memoryDisplayTitle({ type: "photo" })).toBe("사진으로 남긴 추억");
    expect(memoryDisplayTitle({ type: "text" })).toBe("글로 남긴 추억");
    expect(memoryDisplayTitle({ type: "video" })).toBe("영상으로 남긴 추억");
    expect(memoryDisplayTitle({ type: "audio" })).toBe("목소리로 남긴 추억");
  });

  it("accepts past pinned times and rejects future pinned times in every edit path", () => {
    const past = "2020-07-17T03:00:00.000Z";
    const future = "2999-07-17T03:00:00.000Z";
    expect(memoryEditSchema.parse({ firstPinnedAt: past }).firstPinnedAt).toEqual(new Date(past));
    expect(memoryReplacementSchema.parse({ firstPinnedAt: past, idempotencyKey: crypto.randomUUID() }).firstPinnedAt).toEqual(new Date(past));
    expect(missionCompletionSchema.parse({ memoryType: "text", text: "기억", firstPinnedAt: past, idempotencyKey: crypto.randomUUID(), replaceExisting: true }).firstPinnedAt).toEqual(new Date(past));
    expect(() => memoryEditSchema.parse({ firstPinnedAt: future })).toThrow("날짜와 시간은 지금보다 이후로 정할 수 없어요");
    expect(() => memoryReplacementSchema.parse({ firstPinnedAt: future, idempotencyKey: crypto.randomUUID() })).toThrow("날짜와 시간은 지금보다 이후로 정할 수 없어요");
    expect(() => missionCompletionSchema.parse({ memoryType: "text", text: "기억", firstPinnedAt: future, idempotencyKey: crypto.randomUUID(), replaceExisting: true })).toThrow("날짜와 시간은 지금보다 이후로 정할 수 없어요");
    for (const invalid of [null, 0, true]) {
      expect(() => memoryEditSchema.parse({ firstPinnedAt: invalid })).toThrow();
    }
  });
});
