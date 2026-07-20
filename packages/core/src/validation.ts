import { z } from "zod";
import { EMOTIONS, MEMORY_TYPES, USER_GENDERS } from "./types";

const unsafeUserText = /[<>\u0000-\u001f\u007f]|(?:javascript:|data:text|<\/?script\b)/iu;

export const memoryTitleSchema = z.string().trim().max(30).superRefine((value, context) => {
  if (unsafeUserText.test(value)) context.addIssue({ code: "custom", message: "제목에는 일반 문자만 입력해 주세요" });
}).transform((value) => value || null);

const namePattern = /^[가-힣A-Za-z0-9 ]+$/u;
const usernamePattern = /^[a-z0-9_]{4,20}$/;
const commonPasswords = new Set([
  "password", "password1", "password123", "qwerty123", "qwer1234", "asdf1234",
  "12345678", "123456789", "11111111", "00000000", "abc12345", "iloveyou",
]);

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isCommonPassword(value: string): boolean {
  const lowered = value.toLowerCase();
  if (commonPasswords.has(lowered)) return true;
  if (/^(.)\1{7,}$/u.test(value)) return true;
  if (/^(?:01234567|12345678|23456789|87654321|98765432)$/u.test(value)) return true;
  return false;
}

export const accountNameSchema = z.string().trim().min(1, "이름을 입력해 주세요").max(20, "이름은 20자까지 입력할 수 있어요")
  .regex(namePattern, "이름에는 한글, 영문, 숫자와 공백만 사용할 수 있어요");

export const usernameSchema = z.string().transform(normalizeUsername)
  .pipe(z.string().regex(usernamePattern, "아이디는 영문 소문자, 숫자, 밑줄로 4~20자여야 해요"));

export const passwordSchema = z.string().min(8, "비밀번호는 8자 이상이어야 해요").max(128, "비밀번호는 128자까지 입력할 수 있어요")
  .refine((value) => !isCommonPassword(value), "너무 단순하거나 자주 쓰이는 비밀번호는 사용할 수 없어요");

export const signupSchema = z.object({
  displayName: accountNameSchema,
  username: usernameSchema,
  password: passwordSchema,
  passwordConfirm: z.string(),
  gender: z.enum(USER_GENDERS),
}).refine((value) => value.password === value.passwordConfirm, { path: ["passwordConfirm"], message: "비밀번호가 서로 같지 않아요" });

export const loginSchema = z.object({ username: usernameSchema, password: z.string().min(1).max(128) });

export const coupleInvitationCreateSchema = z.object({ username: usernameSchema });
export const coupleInvitationActionSchema = z.object({ action: z.enum(["accept", "decline", "cancel"]) });
export const coupleDisconnectSchema = z.object({
  password: z.string().min(1).max(128),
  phrase: z.literal("연결을 정리할게요"),
});

export const adminUserActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["suspend", "activate", "clear-invitations"]) }),
  z.object({ action: z.literal("delete"), username: usernameSchema }),
]);

export const ADMIN_DISCONNECT_REASONS = ["user_request", "wrong_connection", "account_deletion", "operations", "custom"] as const;
export const adminCoupleDisconnectSchema = z.object({
  action: z.literal("disconnect"),
  reason: z.enum(ADMIN_DISCONNECT_REASONS),
  customReason: z.string().trim().max(200).optional(),
  phrase: z.literal("연결을 정리할게요"),
}).superRefine((value, context) => {
  if (value.reason === "custom" && !value.customReason) context.addIssue({ code: "custom", path: ["customReason"], message: "사유를 입력해 주세요" });
});

export const accountUpdateSchema = z.object({
  displayName: accountNameSchema,
  gender: z.enum(USER_GENDERS),
}).strict();

export const dateEventSchema = z.object({
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  title: z.string().trim().max(80).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
}).refine((value) => value.endAt > value.startAt, { message: "종료 시간은 시작 시간보다 늦어야 해요" });

export const dateEventCreateSchema = z.object({
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  title: z.string().trim().max(80).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  clientRequestId: z.uuid(),
}).refine((value) => value.endAt > value.startAt, { message: "종료 시간은 시작 시간보다 늦어야 해요" });

const customEmotionSchema = z.string().trim().min(1).max(30).superRefine((value, context) => {
  if (/[<>\u0000-\u001f\u007f]/u.test(value) || /(?:javascript:|data:text|https?:\/\/|cannot read|stack trace|<\/?[a-z])/iu.test(value)) {
    context.addIssue({ code: "custom", message: "마음은 자연스러운 한 문장으로 남겨주세요" });
  }
});

export const missionCompletionSchema = z.object({
  memoryType: z.enum(MEMORY_TYPES).exclude(["manual_video"]),
  text: z.string().trim().max(300).optional(),
  emotionId: z.string().trim().max(50).optional(),
  customEmotion: customEmotionSchema.optional(),
  customTitle: memoryTitleSchema.optional(),
  dateEventId: z.uuid().nullable().optional(),
  idempotencyKey: z.uuid(),
  replaceExisting: z.boolean().optional().default(false),
  deferReplacement: z.boolean().optional().default(false),
}).superRefine((value, context) => {
  if (value.memoryType === "text" && !value.text) context.addIssue({ code: "custom", message: "한 문장을 입력해 주세요" });
  if (value.memoryType === "emotion") {
    const hasKnownEmotion = Boolean(value.emotionId && EMOTIONS.some((item) => item.enabled && item.id === value.emotionId));
    const hasCustomEmotion = Boolean(value.customEmotion);
    if (hasKnownEmotion === hasCustomEmotion) context.addIssue({ code: "custom", message: "기본 감정이나 직접 적은 마음 중 하나를 골라 주세요" });
  }
});

export const manualMemoryCreateSchema = z.object({
  type: z.enum(["photo", "video", "audio", "text"]),
  customTitle: memoryTitleSchema.optional(),
  text: z.string().trim().max(300).optional().nullable(),
  dateEventId: z.uuid().optional().nullable(),
  idempotencyKey: z.uuid(),
}).superRefine((value, context) => {
  if (value.type === "text" && !value.text) context.addIssue({ code: "custom", message: "남길 글을 입력해 주세요" });
  if (value.text && unsafeUserText.test(value.text)) context.addIssue({ code: "custom", message: "내용에는 일반 문자만 입력해 주세요" });
});

const memoryEditFields = {
  customTitle: memoryTitleSchema.optional(),
  text: z.string().trim().max(300).optional().nullable(),
  dateEventId: z.uuid().nullable().optional(),
};

function validateMemoryEditText(value: { text?: string | null }, context: z.RefinementCtx) {
  if (value.text && unsafeUserText.test(value.text)) context.addIssue({ code: "custom", message: "내용에는 일반 문자만 입력해 주세요" });
}

export const memoryEditSchema = z.object(memoryEditFields).superRefine(validateMemoryEditText);
export const memoryReplacementSchema = z.object({ ...memoryEditFields, idempotencyKey: z.uuid() }).superRefine(validateMemoryEditText);

export const coupleMissionIntervalSchema = z.object({
  minMinutes: z.number().int().min(10).max(240),
  maxMinutes: z.number().int().min(10).max(240),
}).refine((value) => value.minMinutes <= value.maxMinutes, { message: "최소 간격은 최대 간격보다 작거나 같아야 해요" });

export const missionCapabilitiesSchema = z.object({
  capabilities: z.array(z.enum(["microphone", "camera", "media-library"])).max(3),
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
