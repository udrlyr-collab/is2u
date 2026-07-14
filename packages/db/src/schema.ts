import { sql } from "drizzle-orm";
import {
  bigint, bigserial, boolean, check, foreignKey, index, integer, jsonb, pgEnum, pgTable,
  text, timestamp, uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";
import { ASSET_ROLES, DATE_STATUSES, MEMORY_TYPES, MISSION_STATUSES, MISSION_TYPES, PROCESSING_STATUSES, UPLOAD_STATUSES } from "@is2u/core/types";

export const dateStatusEnum = pgEnum("date_status", DATE_STATUSES);
export const missionTypeEnum = pgEnum("mission_type", MISSION_TYPES);
export const missionStatusEnum = pgEnum("mission_status", MISSION_STATUSES);
export const memoryTypeEnum = pgEnum("memory_type", MEMORY_TYPES);
export const assetRoleEnum = pgEnum("asset_role", ASSET_ROLES);
export const uploadStatusEnum = pgEnum("upload_status", UPLOAD_STATUSES);
export const processingStatusEnum = pgEnum("processing_status", PROCESSING_STATUSES);

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  displayName: varchar("display_name", { length: 50 }).notNull(),
  roleLabel: varchar("role_label", { length: 30 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  csrfHash: varchar("csrf_hash", { length: 64 }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  deviceHash: varchar("device_hash", { length: 64 }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("sessions_token_hash_uidx").on(table.tokenHash), index("sessions_user_idx").on(table.userId)]);

export const loginAttempts = pgTable("login_attempts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ipHash: varchar("ip_hash", { length: 64 }).notNull(),
  deviceHash: varchar("device_hash", { length: 64 }).notNull(),
  succeeded: boolean("succeeded").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("login_attempts_limit_idx").on(table.ipHash, table.deviceHash, table.createdAt)]);

export const dateEvents = pgTable("date_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  title: varchar("title", { length: 80 }),
  note: varchar("note", { length: 500 }),
  status: dateStatusEnum("status").default("scheduled").notNull(),
  isTest: boolean("is_test").default(false).notNull(),
  clientRequestId: uuid("client_request_id"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("date_events_valid_range", sql`${table.endAt} > ${table.startAt}`),
  index("date_events_time_idx").on(table.startAt, table.endAt),
  index("date_events_visible_idx").on(table.deletedAt, table.startAt),
  uniqueIndex("date_events_client_request_uidx").on(table.clientRequestId),
]);

export const missions = pgTable("missions", {
  id: uuid("id").defaultRandom().primaryKey(),
  dateEventId: uuid("date_event_id").references(() => dateEvents.id, { onDelete: "restrict" }),
  recipientId: uuid("recipient_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  type: missionTypeEnum("type").notNull(),
  templateId: varchar("template_id", { length: 100 }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  status: missionStatusEnum("status").default("scheduled").notNull(),
  isTest: boolean("is_test").default(false).notNull(),
  source: varchar("source", { length: 30 }).default("automatic").notNull(),
  jobId: varchar("job_id", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("missions_date_event_idx").on(table.dateEventId, table.source, table.scheduledAt),
  index("missions_delivery_idx").on(table.status, table.scheduledAt),
  index("missions_test_idx").on(table.isTest, table.createdAt),
]);

export const memories = pgTable("memories", {
  id: uuid("id").defaultRandom().primaryKey(),
  dateEventId: uuid("date_event_id").references(() => dateEvents.id, { onDelete: "restrict" }),
  missionId: uuid("mission_id").references(() => missions.id, { onDelete: "restrict" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
  type: memoryTypeEnum("type").notNull(),
  customTitle: varchar("custom_title", { length: 30 }),
  text: varchar("text", { length: 300 }),
  emotion: varchar("emotion", { length: 30 }),
  idempotencyKey: uuid("idempotency_key").notNull(),
  pendingReplacement: boolean("pending_replacement").default(false).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  purgeAfter: timestamp("purge_after", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  firstPinnedAt: timestamp("first_pinned_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("memories_mission_idx").on(table.missionId, table.createdAt), uniqueIndex("memories_idempotency_uidx").on(table.idempotencyKey), index("memories_visible_idx").on(table.deletedAt, table.pendingReplacement, table.createdAt)]);

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  memoryId: uuid("memory_id").references(() => memories.id, { onDelete: "cascade" }).notNull(),
  parentAssetId: uuid("parent_asset_id"),
  role: assetRoleEnum("role").notNull(),
  storageKey: text("storage_key").notNull(),
  originalFilename: varchar("original_filename", { length: 255 }),
  mimeType: varchar("mime_type", { length: 150 }).notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  checksumSha256: varchar("checksum_sha256", { length: 64 }),
  width: integer("width"),
  height: integer("height"),
  durationMs: integer("duration_ms"),
  processingStatus: processingStatusEnum("processing_status").default("pending").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("media_assets_storage_uidx").on(table.storageKey),
  index("media_assets_memory_idx").on(table.memoryId, table.role),
  foreignKey({ name: "media_assets_parent_fk", columns: [table.parentAssetId], foreignColumns: [table.id] }).onDelete("cascade"),
]);

export const uploadSessions = pgTable("upload_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  assetId: uuid("asset_id").references(() => mediaAssets.id, { onDelete: "cascade" }).notNull(),
  objectKey: text("object_key").notNull(),
  multipartUploadId: text("multipart_upload_id"),
  parts: jsonb("parts").$type<Array<{ partNumber: number; etag: string }>>().default([]).notNull(),
  status: uploadStatusEnum("status").default("created").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("upload_sessions_owner_idx").on(table.ownerId, table.status), index("upload_sessions_expiry_idx").on(table.status, table.expiresAt)]);

export const processingJobs = pgTable("processing_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobType: varchar("job_type", { length: 50 }).notNull(),
  assetId: uuid("asset_id").references(() => mediaAssets.id, { onDelete: "cascade" }).notNull(),
  status: processingStatusEnum("status").default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  errorSummary: varchar("error_summary", { length: 300 }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("processing_jobs_status_idx").on(table.status, table.scheduledAt)]);

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  notificationPermission: varchar("notification_permission", { length: 20 }).default("default").notNull(),
  notificationStartHour: integer("notification_start_hour").default(10).notNull(),
  notificationEndHour: integer("notification_end_hour").default(22).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const coupleSettings = pgTable("couple_settings", {
  id: integer("id").primaryKey().default(1),
  weeklyMissionLimit: integer("weekly_mission_limit").default(2).notNull(),
  missionIntervalMinMinutes: integer("mission_interval_min_minutes").default(40).notNull(),
  missionIntervalMaxMinutes: integer("mission_interval_max_minutes").default(90).notNull(),
  timezone: varchar("timezone", { length: 50 }).default("Asia/Seoul").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("couple_settings_singleton", sql`${table.id} = 1`),
  check("couple_settings_mission_interval_min", sql`${table.missionIntervalMinMinutes} >= 20 AND ${table.missionIntervalMinMinutes} <= 240`),
  check("couple_settings_mission_interval_max", sql`${table.missionIntervalMaxMinutes} >= ${table.missionIntervalMinMinutes} AND ${table.missionIntervalMaxMinutes} <= 240`),
]);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("push_subscriptions_endpoint_uidx").on(table.endpoint), index("push_subscriptions_user_idx").on(table.userId, table.invalidatedAt)]);

export const auditEvents = pgTable("audit_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("audit_events_time_idx").on(table.createdAt)]);
