CREATE TABLE "date_mission_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_event_id" uuid NOT NULL,
	"couple_id" uuid NOT NULL,
	"next_mission_at" timestamp with time zone,
	"last_mission_at" timestamp with time zone,
	"last_recipient_user_id" uuid,
	"missions_sent_count" integer DEFAULT 0 NOT NULL,
	"recipient_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'waiting' NOT NULL,
	"dispatch_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "date_mission_schedules_status_check" CHECK ("date_mission_schedules"."status" IN ('waiting', 'active', 'paused', 'completed', 'cancelled')),
	CONSTRAINT "date_mission_schedules_sent_count_check" CHECK ("date_mission_schedules"."missions_sent_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "couple_settings" DROP CONSTRAINT "couple_settings_mission_interval_min";--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "schedule_dispatch_key" uuid;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "notification_key" uuid;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "notification_status" varchar(20);--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "notification_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "notification_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "notification_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "notification_failure_code" varchar(80);--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "mission_capabilities" jsonb DEFAULT '["microphone","camera","media-library"]'::jsonb NOT NULL;--> statement-breakpoint
INSERT INTO "couple_settings" ("couple_id") SELECT "id" FROM "couples" ON CONFLICT ("couple_id") DO NOTHING;--> statement-breakpoint
UPDATE "missions" SET "status" = 'cancelled', "updated_at" = now() WHERE "source" = 'automatic' AND "status" = 'scheduled' AND "deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "date_mission_schedules" ADD CONSTRAINT "date_mission_schedules_date_event_id_date_events_id_fk" FOREIGN KEY ("date_event_id") REFERENCES "public"."date_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_mission_schedules" ADD CONSTRAINT "date_mission_schedules_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_mission_schedules" ADD CONSTRAINT "date_mission_schedules_last_recipient_user_id_users_id_fk" FOREIGN KEY ("last_recipient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "date_mission_schedules_event_uidx" ON "date_mission_schedules" USING btree ("date_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "date_mission_schedules_dispatch_uidx" ON "date_mission_schedules" USING btree ("dispatch_key");--> statement-breakpoint
CREATE INDEX "date_mission_schedules_due_idx" ON "date_mission_schedules" USING btree ("status","next_mission_at");--> statement-breakpoint
CREATE INDEX "date_mission_schedules_couple_idx" ON "date_mission_schedules" USING btree ("couple_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "missions_schedule_dispatch_uidx" ON "missions" USING btree ("schedule_dispatch_key");--> statement-breakpoint
CREATE UNIQUE INDEX "missions_notification_key_uidx" ON "missions" USING btree ("notification_key");--> statement-breakpoint
CREATE INDEX "missions_notification_pending_idx" ON "missions" USING btree ("notification_status","notification_claimed_at");--> statement-breakpoint
ALTER TABLE "couple_settings" ADD CONSTRAINT "couple_settings_mission_interval_min" CHECK ("couple_settings"."mission_interval_min_minutes" >= 10 AND "couple_settings"."mission_interval_min_minutes" <= 240);
