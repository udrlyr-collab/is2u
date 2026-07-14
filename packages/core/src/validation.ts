import { z } from "zod";
import { EMOTIONS, MEMORY_TYPES } from "./types";

export const loginSchema = z.object({ pin: z.string().regex(/^\d{4}$/) });

export const dateEventSchema = z.object({
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  title: z.string().trim().max(80).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
}).refine((value) => value.endAt > value.startAt, { message: "종료 시간은 시작 시간보다 늦어야 합니다." });

export const dateEventCreateSchema = z.object({
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  title: z.string().trim().max(80).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  clientRequestId: z.uuid(),
}).refine((value) => value.endAt > value.startAt, { message: "종료 시간은 시작 시간보다 늦어야 합니다." });

export const missionCompletionSchema = z.object({
  memoryType: z.enum(MEMORY_TYPES).exclude(["manual_video"]),
  text: z.string().trim().max(300).optional(),
  emotion: z.enum(EMOTIONS).optional(),
  idempotencyKey: z.uuid(),
}).superRefine((value, context) => {
  if (value.memoryType === "text" && !value.text) context.addIssue({ code: "custom", message: "한 문장을 입력해 주세요." });
  if (value.memoryType === "emotion" && !value.emotion) context.addIssue({ code: "custom", message: "기분을 골라 주세요." });
});

export const uploadCreateSchema = z.object({
  memoryId: z.uuid(),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(150),
  size: z.number().int().positive(),
});

export const manualMemorySchema = z.object({
  dateEventId: z.uuid(),
  note: z.string().trim().max(300).optional().nullable(),
  idempotencyKey: z.uuid(),
});

export function classifyMedia(mimeType: string): "photo" | "audio" | "video" | null {
  if (mimeType.startsWith("image/")) return "photo";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return null;
}

export function safeExtension(filename: string, mimeType: string): string {
  const fromName = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromName && fromName.length <= 8) return fromName;
  const fallback: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
    "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
    "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav",
  };
  return fallback[mimeType] ?? "bin";
}
