import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import argon2 from "argon2";
import webpush from "web-push";

function parseEnv(text: string): Record<string, string> {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || line.trim().startsWith("#")) return [];
    const value = match[2].replace(/^(["'])(.*)\1$/, "$2");
    return [[match[1], value]];
  }));
}

const [requestPath, cloudflareEnvPath, outputArg] = process.argv.slice(2);
if (!requestPath || !cloudflareEnvPath) throw new Error("request file and cloudflare env paths are required");
const requestText = await readFile(resolve(requestPath), "utf8");
const pins = [...requestText.matchAll(/Initial PIN:\s*(\d{4})/g)].map((match) => match[1]);
if (pins.length !== 2 || pins[0] === pins[1]) throw new Error("Expected exactly two distinct PINs in the original request");
const cloudflare = parseEnv(await readFile(resolve(cloudflareEnvPath), "utf8"));
for (const key of ["CLOUDFLARE_ACCOUNT_ID", "R2_MEDIA_ACCESS_KEY_ID", "R2_MEDIA_SECRET_ACCESS_KEY", "R2_BACKUP_ACCESS_KEY_ID", "R2_BACKUP_SECRET_ACCESS_KEY"]) {
  if (!cloudflare[key]) throw new Error(`Missing ${key}`);
}

const secret = (bytes = 32) => randomBytes(bytes).toString("base64url");
const postgresPassword = secret(24);
const vapid = webpush.generateVAPIDKeys();
const hashOptions = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const [seoyeongHash, seongminHash] = await Promise.all([argon2.hash(pins[0], hashOptions), argon2.hash(pins[1], hashOptions)]);
pins.fill("");

const values: Record<string, string> = {
  NODE_ENV: "production",
  APP_URL: "https://is2u.today",
  MEDIA_URL: "https://media.is2u.today",
  APP_TIMEZONE: "Asia/Seoul",
  POSTGRES_USER: "is2u",
  POSTGRES_PASSWORD: postgresPassword,
  POSTGRES_DB: "is2u",
  DATABASE_URL: `postgres://is2u:${postgresPassword}@postgres:5432/is2u`,
  SESSION_SECRET: secret(), CSRF_SECRET: secret(), RATE_LIMIT_SECRET: secret(), MEDIA_TOKEN_SECRET: secret(),
  SEOYEONG_PIN_HASH: seoyeongHash, SEONGMIN_PIN_HASH: seongminHash,
  R2_ACCOUNT_ID: cloudflare.CLOUDFLARE_ACCOUNT_ID,
  R2_MEDIA_ACCESS_KEY_ID: cloudflare.R2_MEDIA_ACCESS_KEY_ID,
  R2_MEDIA_SECRET_ACCESS_KEY: cloudflare.R2_MEDIA_SECRET_ACCESS_KEY,
  R2_BACKUP_ACCESS_KEY_ID: cloudflare.R2_BACKUP_ACCESS_KEY_ID,
  R2_BACKUP_SECRET_ACCESS_KEY: cloudflare.R2_BACKUP_SECRET_ACCESS_KEY,
  R2_MEDIA_BUCKET: "is2u-media-prod", R2_BACKUP_BUCKET: "is2u-backups-prod",
  VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: "mailto:admin@is2u.today",
  BACKUP_ENCRYPTION_KEY: secret(),
  MAX_PHOTO_BYTES: "26214400", MAX_AUDIO_BYTES: "26214400", MAX_MISSION_VIDEO_BYTES: "262144000", MAX_MANUAL_VIDEO_BYTES: "5368709120",
  MISSION_WEEKLY_LIMIT: "2", MISSION_NOTIFICATION_START_HOUR: "10", MISSION_NOTIFICATION_END_HOUR: "22", DEV_SIMULATOR_ENABLED: "false",
};
const output = resolve(outputArg ?? `${homedir()}/.is2u/server.env`);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, Object.entries(values).map(([key, value]) => `${key}='${value}'`).join("\n") + "\n", { mode: 0o600 });
console.log(`server_env_ready=${output}`);
