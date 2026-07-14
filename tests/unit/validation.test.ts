import { describe, expect, it } from "vitest";
import { dateEventCreateSchema, dateEventSchema, missionCompletionSchema, safeExtension } from "@is2u/core/validation";
import { EMOTIONS } from "@is2u/core/types";

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
});
