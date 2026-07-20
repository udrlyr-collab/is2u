import { sql } from "drizzle-orm";
import {
  bigint, bigserial, boolean, check, foreignKey, index, integer, jsonb, pgEnum, pgTable,
  serial, text, timestamp, uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";
import { ACCOUNT_STATUSES, ASSET_ROLES, COUPLE_INVITATION_STATUSES, COUPLE_STATUSES, DATE_STATUSES, MEMORY_TYPES, MISSION_STATUSES, MISSION_TYPES, PROCESSING_STATUSES, UPLOAD_STATUSES, USER_GENDERS, USER_ROLES } from "@is2u/core/types";

export const dateStatusEnum = pgEnum("date_status", DATE_STATUSES);
export const missionTypeEnum = pgEnum("mission_type", MISSION_TYPES);
export const missionStatusEnum = pgEnum("mission_status", MISSION_STATUSES);
export const memoryTypeEnum = pgEnum("memory_type", MEMORY_TYPES);
export const assetRoleEnum = pgEnum("asset_role", ASSET_ROLES);
export const uploadStatusEnum = pgEnum("upload_status", UPLOAD_STATUSES);
export const processingStatusEnum = pgEnum("processing_status", PROCESSING_STATUSES);
export const userGenderEnum = pgEnum("user_gender", USER_GENDERS);
export const userRoleEnum = pgEnum("user_role", USER_ROLES);
export const accountStatusEnum = pgEnum("account_status", ACCOUNT_STATUSES);
export const coupleStatusEnum = pgEnum("couple_status", COUPLE_STATUSES);
export const coupleInvitationStatusEnum = pgEnum("couple_invitation_status", COUPLE_INVITATION_STATUSES);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  displayName: varchar("display_name", { length: 50 }).notNull(),
  roleLabel: varchar("role_label", { length: 30 }).notNull(),
  username: varchar("username", { length: 20 }),
  passwordHash: text("password_hash"),
  gender: userGenderEnum("gender").notNull(),
  role: userRoleEnum("role").default("user").notNull(),
  accountStatus: accountStatusEnum("account_status").default("active").notNull(),
  credentialsActivatedAt: timestamp("credentials_activated_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("users_username_uidx").on(table.username),
  check("users_username_normalized", sql`${table.username} IS NULL OR ${table.username} = lower(${table.username})`),
  check("users_credentials_complete", sql`(${table.username} IS NULL AND ${table.passwordHash} IS NULL AND ${table.credentialsActivatedAt} IS NULL) OR (${table.username} IS NOT NULL AND ${table.passwordHash} IS NOT NULL AND ${table.credentialsActivatedAt} IS NOT NULL)`),
]);

export const couples = pgTable("couples", {
  id: uuid("id").defaultRandom().primaryKey(),
  status: coupleStatusEnum("status").default("active").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  endedBy: uuid("ended_by").references(() => users.id, { onDelete: "restrict" }),
  disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
  initiatedByUserId: uuid("initiated_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  initiatedByAdminId: uuid("initiated_by_admin_id").references(() => users.id, { onDelete: "restrict" }),
  disconnectReason: varchar("disconnect_reason", { length: 300 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [check("couples_end_state", sql`(${table.status} = 'active' AND ${table.endedAt} IS NULL) OR (${table.status} = 'ended' AND ${table.endedAt} IS NOT NULL)`) ]);

export const coupleMembers = pgTable("couple_members", {
  coupleId: uuid("couple_id").references(() => couples.id, { onDelete: "restrict" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  leftAt: timestamp("left_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("couple_members_pair_uidx").on(table.coupleId, table.userId),
  uniqueIndex("couple_members_one_active_uidx").on(table.userId).where(sql`${table.leftAt} IS NULL`),
  index("couple_members_couple_idx").on(table.coupleId, table.leftAt),
]);

export const coupleInvitations = pgTable("couple_invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  senderId: uuid("sender_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  recipientId: uuid("recipient_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  pairKey: varchar("pair_key", { length: 73 }).notNull(),
  status: coupleInvitationStatusEnum("status").default("pending").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("couple_invitations_not_self", sql`${table.senderId} <> ${table.recipientId}`),
  uniqueIndex("couple_invitations_pending_pair_uidx").on(table.pairKey).where(sql`${table.status} = 'pending'`),
  index("couple_invitations_recipient_idx").on(table.recipientId, table.status, table.createdAt),
  index("couple_invitations_sender_idx").on(table.senderId, table.status, table.createdAt),
]);

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
  identifierHash: varchar("identifier_hash", { length: 64 }),
  succeeded: boolean("succeeded").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("login_attempts_limit_idx").on(table.ipHash, table.deviceHash, table.createdAt),
  index("login_attempts_identifier_idx").on(table.identifierHash, table.createdAt),
]);

export const dateEvents = pgTable("date_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  coupleId: uuid("couple_id").references(() => couples.id, { onDelete: "restrict" }).notNull(),
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
  coupleId: uuid("couple_id").references(() => couples.id, { onDelete: "restrict" }),
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
  scheduleDispatchKey: uuid("schedule_dispatch_key"),
  notificationKey: uuid("notification_key"),
  notificationStatus: varchar("notification_status", { length: 20 }),
  notificationAttempts: integer("notification_attempts").default(0).notNull(),
  notificationClaimedAt: timestamp("notification_claimed_at", { withTimezone: true }),
  notificationSentAt: timestamp("notification_sent_at", { withTimezone: true }),
  notificationFailureCode: varchar("notification_failure_code", { length: 80 }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  purgeAfter: timestamp("purge_after", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("missions_date_event_idx").on(table.dateEventId, table.source, table.scheduledAt),
  index("missions_delivery_idx").on(table.status, table.scheduledAt),
  index("missions_test_idx").on(table.isTest, table.createdAt),
  index("missions_visible_idx").on(table.deletedAt, table.scheduledAt),
  uniqueIndex("missions_schedule_dispatch_uidx").on(table.scheduleDispatchKey),
  uniqueIndex("missions_notification_key_uidx").on(table.notificationKey),
  index("missions_notification_pending_idx").on(table.notificationStatus, table.notificationClaimedAt),
]);

export const dateMissionSchedules = pgTable("date_mission_schedules", {
  id: uuid("id").defaultRandom().primaryKey(),
  dateEventId: uuid("date_event_id").references(() => dateEvents.id, { onDelete: "restrict" }).notNull(),
  coupleId: uuid("couple_id").references(() => couples.id, { onDelete: "restrict" }).notNull(),
  nextMissionAt: timestamp("next_mission_at", { withTimezone: true }),
  lastMissionAt: timestamp("last_mission_at", { withTimezone: true }),
  lastRecipientUserId: uuid("last_recipient_user_id").references(() => users.id, { onDelete: "restrict" }),
  missionsSentCount: integer("missions_sent_count").default(0).notNull(),
  recipientCounts: jsonb("recipient_counts").$type<Record<string, number>>().default({}).notNull(),
  status: varchar("status", { length: 20 }).default("waiting").notNull(),
  dispatchKey: uuid("dispatch_key").defaultRandom().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("date_mission_schedules_event_uidx").on(table.dateEventId),
  uniqueIndex("date_mission_schedules_dispatch_uidx").on(table.dispatchKey),
  index("date_mission_schedules_due_idx").on(table.status, table.nextMissionAt),
  index("date_mission_schedules_couple_idx").on(table.coupleId, table.status),
  check("date_mission_schedules_status_check", sql`${table.status} IN ('waiting', 'active', 'paused', 'completed', 'cancelled')`),
  check("date_mission_schedules_sent_count_check", sql`${table.missionsSentCount} >= 0`),
]);

export const memories = pgTable("memories", {
  id: uuid("id").defaultRandom().primaryKey(),
  coupleId: uuid("couple_id").references(() => couples.id, { onDelete: "restrict" }),
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

export const memoryBoards = pgTable("memory_boards", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  title: varchar("title", { length: 80 }).default("새 보드").notNull(),
  description: varchar("description", { length: 300 }),
  visibility: varchar("visibility", { length: 20 }).default("partner").notNull(),
  viewportX: integer("viewport_x").default(0).notNull(),
  viewportY: integer("viewport_y").default(0).notNull(),
  zoomPermille: integer("zoom_permille").default(1000).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("memory_boards_owner_updated_idx").on(table.ownerId, table.updatedAt),
  check("memory_boards_zoom_check", sql`${table.zoomPermille} >= 500 AND ${table.zoomPermille} <= 2400`),
]);

export const boardAssets = pgTable("board_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  boardId: uuid("board_id").references(() => memoryBoards.id, { onDelete: "cascade" }).notNull(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  storageKey: text("storage_key").notNull(),
  originalFilename: varchar("original_filename", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  status: varchar("status", { length: 20 }).default("uploading").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("board_assets_board_idx").on(table.boardId, table.createdAt),
  uniqueIndex("board_assets_storage_uidx").on(table.storageKey),
]);

export const memoryGroups = pgTable("memory_groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  boardId: uuid("board_id").references(() => memoryBoards.id, { onDelete: "cascade" }).notNull(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 50 }).notNull(),
  note: varchar("note", { length: 200 }),
  representativeMemoryId: uuid("representative_memory_id").references(() => memories.id, { onDelete: "set null" }),
  style: varchar("style", { length: 20 }).default("butter").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("memory_groups_board_idx").on(table.boardId, table.updatedAt)]);

export const memoryGroupItems = pgTable("memory_group_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: uuid("group_id").references(() => memoryGroups.id, { onDelete: "cascade" }).notNull(),
  memoryId: uuid("memory_id").references(() => memories.id, { onDelete: "cascade" }).notNull(),
  position: integer("position").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("memory_group_items_pair_uidx").on(table.groupId, table.memoryId),
  index("memory_group_items_order_idx").on(table.groupId, table.position),
]);

export const boardItems = pgTable("board_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  boardId: uuid("board_id").references(() => memoryBoards.id, { onDelete: "cascade" }).notNull(),
  memoryId: uuid("memory_id").references(() => memories.id, { onDelete: "cascade" }),
  groupId: uuid("group_id").references(() => memoryGroups.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id").references(() => boardAssets.id, { onDelete: "cascade" }),
  elementType: varchar("element_type", { length: 20 }).default("memory").notNull(),
  textContent: varchar("text_content", { length: 500 }),
  styleJson: jsonb("style_json").$type<Record<string, string | number | boolean | null>>().default({}).notNull(),
  x: integer("x").default(120).notNull(),
  y: integer("y").default(120).notNull(),
  width: integer("width").default(240).notNull(),
  height: integer("height").default(190).notNull(),
  rotationTenths: integer("rotation_tenths").default(0).notNull(),
  zIndex: integer("z_index").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("board_items_memory_idx").on(table.boardId, table.memoryId),
  uniqueIndex("board_items_group_uidx").on(table.boardId, table.groupId),
  uniqueIndex("board_items_asset_uidx").on(table.boardId, table.assetId),
  index("board_items_board_z_idx").on(table.boardId, table.zIndex),
  check("board_items_size_check", sql`${table.width} BETWEEN 80 AND 720 AND ${table.height} BETWEEN 60 AND 620`),
  check("board_items_rotation_check", sql`${table.rotationTenths} BETWEEN -120 AND 120`),
]);

export const boardThreads = pgTable("board_threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  boardId: uuid("board_id").references(() => memoryBoards.id, { onDelete: "cascade" }).notNull(),
  firstItemId: uuid("first_item_id").references(() => boardItems.id, { onDelete: "set null" }),
  secondItemId: uuid("second_item_id").references(() => boardItems.id, { onDelete: "set null" }),
  startX: integer("start_x").default(260).notNull(),
  startY: integer("start_y").default(280).notNull(),
  endX: integer("end_x").default(1540).notNull(),
  endY: integer("end_y").default(280).notNull(),
  curve: integer("curve").default(36).notNull(),
  color: varchar("color", { length: 20 }).default("warm-brown").notNull(),
  mode: varchar("mode", { length: 20 }).default("hanging").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("board_threads_board_idx").on(table.boardId),
  check("board_threads_curve_check", sql`${table.curve} BETWEEN -160 AND 160`),
  check("board_threads_mode_check", sql`${table.mode} IN ('hanging', 'linking')`),
]);

export const boardThreadItems = pgTable("board_thread_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  threadId: uuid("thread_id").references(() => boardThreads.id, { onDelete: "cascade" }).notNull(),
  itemId: uuid("item_id").references(() => boardItems.id, { onDelete: "cascade" }).notNull(),
  position: integer("position").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("board_thread_items_pair_uidx").on(table.threadId, table.itemId),
  index("board_thread_items_order_idx").on(table.threadId, table.position),
]);

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
  missionCapabilities: jsonb("mission_capabilities").$type<string[]>().default(["microphone", "camera", "media-library"]).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const coupleSettings = pgTable("couple_settings", {
  id: serial("id").primaryKey(),
  coupleId: uuid("couple_id").references(() => couples.id, { onDelete: "restrict" }).notNull(),
  weeklyMissionLimit: integer("weekly_mission_limit").default(2).notNull(),
  missionIntervalMinMinutes: integer("mission_interval_min_minutes").default(40).notNull(),
  missionIntervalMaxMinutes: integer("mission_interval_max_minutes").default(90).notNull(),
  timezone: varchar("timezone", { length: 50 }).default("Asia/Seoul").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("couple_settings_couple_uidx").on(table.coupleId),
  check("couple_settings_mission_interval_min", sql`${table.missionIntervalMinMinutes} >= 10 AND ${table.missionIntervalMinMinutes} <= 240`),
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

export const adminTestDispatches = pgTable("admin_test_dispatches", {
  id: uuid("id").defaultRandom().primaryKey(),
  missionId: uuid("mission_id").references(() => missions.id, { onDelete: "cascade" }).notNull(),
  adminId: uuid("admin_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  recipientId: uuid("recipient_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  deliveryStatus: varchar("delivery_status", { length: 20 }).notNull(),
  failureCode: varchar("failure_code", { length: 80 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("admin_test_dispatches_mission_uidx").on(table.missionId),
  index("admin_test_dispatches_admin_time_idx").on(table.adminId, table.createdAt),
]);
