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

const customEmotionSchema = z.string().trim().min(1).max(30).superRefine((value, context) => {
  if (/[<>\u0000-\u001f\u007f]/u.test(value) || /(?:javascript:|data:text|https?:\/\/|cannot read|stack trace|<\/?[a-z])/iu.test(value)) {
    context.addIssue({ code: "custom", message: "마음은 자연스러운 한 문장으로 남겨주세요." });
  }
});

export const missionCompletionSchema = z.object({
  memoryType: z.enum(MEMORY_TYPES).exclude(["manual_video"]),
  text: z.string().trim().max(300).optional(),
  emotionId: z.string().trim().max(50).optional(),
  customEmotion: customEmotionSchema.optional(),
  idempotencyKey: z.uuid(),
  replaceExisting: z.boolean().optional().default(false),
  deferReplacement: z.boolean().optional().default(false),
}).superRefine((value, context) => {
  if (value.memoryType === "text" && !value.text) context.addIssue({ code: "custom", message: "한 문장을 입력해 주세요." });
  if (value.memoryType === "emotion") {
    const hasKnownEmotion = Boolean(value.emotionId && EMOTIONS.some((item) => item.enabled && item.id === value.emotionId));
    const hasCustomEmotion = Boolean(value.customEmotion);
    if (hasKnownEmotion === hasCustomEmotion) context.addIssue({ code: "custom", message: "기본 감정이나 직접 적은 마음 중 하나를 골라 주세요." });
  }
});

export function resolveEmotion(input: { emotionId?: string; customEmotion?: string }): string | null {
  if (input.customEmotion) return input.customEmotion;
  return EMOTIONS.find((item) => item.enabled && item.id === input.emotionId)?.label ?? null;
}

export const uploadCreateSchema = z.object({
  memoryId: z.uuid(),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(150),
  size: z.number().int().positive(),
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
