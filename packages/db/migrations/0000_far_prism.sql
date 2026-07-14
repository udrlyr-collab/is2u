CREATE TYPE "public"."asset_role" AS ENUM('original', 'preview', 'thumbnail', 'poster');--> statement-breakpoint
CREATE TYPE "public"."date_status" AS ENUM('scheduled', 'active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."memory_type" AS ENUM('audio', 'photo', 'video', 'text', 'emotion', 'manual_video');--> statement-breakpoint
CREATE TYPE "public"."mission_status" AS ENUM('scheduled', 'sent', 'completed', 'skipped', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."mission_type" AS ENUM('audio', 'photo', 'video', 'text', 'emotion');--> statement-breakpoint
CREATE TYPE "public"."processing_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('created', 'uploading', 'uploaded', 'aborted', 'expired', 'failed');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(50),
	"entity_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "couple_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"weekly_mission_limit" integer DEFAULT 2 NOT NULL,
	"timezone" varchar(50) DEFAULT 'Asia/Seoul' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "couple_settings_singleton" CHECK ("couple_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "date_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"title" varchar(80),
	"note" varchar(500),
	"status" date_status DEFAULT 'scheduled' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "date_events_valid_range" CHECK ("date_events"."end_at" > "date_events"."start_at")
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ip_hash" varchar(64) NOT NULL,
	"device_hash" varchar(64) NOT NULL,
	"succeeded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid NOT NULL,
	"parent_asset_id" uuid,
	"role" "asset_role" NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" varchar(255),
	"mime_type" varchar(150) NOT NULL,
	"file_size" bigint NOT NULL,
	"checksum_sha256" varchar(64),
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"processing_status" "processing_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_event_id" uuid NOT NULL,
	"mission_id" uuid,
	"created_by" uuid NOT NULL,
	"type" "memory_type" NOT NULL,
	"text" varchar(300),
	"emotion" varchar(30),
	"idempotency_key" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_event_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"type" "mission_type" NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"status" "mission_status" DEFAULT 'scheduled' NOT NULL,
	"job_id" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" varchar(50) NOT NULL,
	"asset_id" uuid NOT NULL,
	"status" "processing_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_summary" varchar(300),
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"invalidated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"csrf_hash" varchar(64) NOT NULL,
	"user_id" uuid NOT NULL,
	"device_hash" varchar(64),
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"multipart_upload_id" text,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "upload_status" DEFAULT 'created' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"notification_permission" varchar(20) DEFAULT 'default' NOT NULL,
	"notification_start_hour" integer DEFAULT 10 NOT NULL,
	"notification_end_hour" integer DEFAULT 22 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" varchar(50) NOT NULL,
	"role_label" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_events" ADD CONSTRAINT "date_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_date_event_id_date_events_id_fk" FOREIGN KEY ("date_event_id") REFERENCES "public"."date_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_date_event_id_date_events_id_fk" FOREIGN KEY ("date_event_id") REFERENCES "public"."date_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_time_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "date_events_time_idx" ON "date_events" USING btree ("start_at","end_at");--> statement-breakpoint
CREATE INDEX "login_attempts_limit_idx" ON "login_attempts" USING btree ("ip_hash","device_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_storage_uidx" ON "media_assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "media_assets_memory_idx" ON "media_assets" USING btree ("memory_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "memories_mission_uidx" ON "memories" USING btree ("mission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memories_idempotency_uidx" ON "memories" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "memories_visible_idx" ON "memories" USING btree ("deleted_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "missions_date_event_uidx" ON "missions" USING btree ("date_event_id");--> statement-breakpoint
CREATE INDEX "missions_delivery_idx" ON "missions" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "processing_jobs_status_idx" ON "processing_jobs" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_uidx" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id","invalidated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uidx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "upload_sessions_owner_idx" ON "upload_sessions" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "upload_sessions_expiry_idx" ON "upload_sessions" USING btree ("status","expires_at");