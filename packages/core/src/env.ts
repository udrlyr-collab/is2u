import { z } from "zod";

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  MEDIA_URL: z.url().default("http://localhost:8787"),
  APP_TIMEZONE: z.string().default("Asia/Seoul"),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  RATE_LIMIT_SECRET: z.string().min(32),
  MEDIA_TOKEN_SECRET: z.string().min(32),
  SEOYEONG_PIN_HASH: z.string().startsWith("$argon2"),
  SEONGMIN_PIN_HASH: z.string().startsWith("$argon2"),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_MEDIA_ACCESS_KEY_ID: z.string().min(1),
  R2_MEDIA_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BACKUP_ACCESS_KEY_ID: z.string().min(1),
  R2_BACKUP_SECRET_ACCESS_KEY: z.string().min(1),
  R2_MEDIA_BUCKET: z.string().default("is2u-media-prod"),
  R2_BACKUP_BUCKET: z.string().default("is2u-backups-prod"),
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().default("mailto:admin@is2u.today"),
  BACKUP_ENCRYPTION_KEY: z.string().min(32),
  MAX_PHOTO_BYTES: positiveInt(25 * 1024 * 1024),
  MAX_AUDIO_BYTES: positiveInt(25 * 1024 * 1024),
  MAX_MISSION_VIDEO_BYTES: positiveInt(250 * 1024 * 1024),
  MAX_MANUAL_VIDEO_BYTES: positiveInt(5 * 1024 * 1024 * 1024),
  MISSION_WEEKLY_LIMIT: positiveInt(2),
  MISSION_NOTIFICATION_START_HOUR: z.coerce.number().int().min(0).max(23).default(10),
  MISSION_NOTIFICATION_END_HOUR: z.coerce.number().int().min(1).max(24).default(22),
  DEV_SIMULATOR_ENABLED: z.enum(["true", "false"]).default("false"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!cached) cached = serverEnvSchema.parse(process.env);
  return cached;
}

export function resetEnvForTests(): void {
  cached = undefined;
}
