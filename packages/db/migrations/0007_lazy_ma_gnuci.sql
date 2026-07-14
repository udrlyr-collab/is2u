DROP INDEX "missions_date_event_uidx";--> statement-breakpoint
ALTER TABLE "memories" ALTER COLUMN "date_event_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "missions" ALTER COLUMN "date_event_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "couple_settings" ADD COLUMN "mission_interval_min_minutes" integer DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE "couple_settings" ADD COLUMN "mission_interval_max_minutes" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "custom_title" varchar(30);--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "source" varchar(30) DEFAULT 'automatic' NOT NULL;--> statement-breakpoint
UPDATE "missions" SET "source" = 'test' WHERE "is_test" = true;--> statement-breakpoint
CREATE INDEX "missions_date_event_idx" ON "missions" USING btree ("date_event_id","source","scheduled_at");--> statement-breakpoint
ALTER TABLE "couple_settings" ADD CONSTRAINT "couple_settings_mission_interval_min" CHECK ("couple_settings"."mission_interval_min_minutes" >= 20 AND "couple_settings"."mission_interval_min_minutes" <= 240);--> statement-breakpoint
ALTER TABLE "couple_settings" ADD CONSTRAINT "couple_settings_mission_interval_max" CHECK ("couple_settings"."mission_interval_max_minutes" >= "couple_settings"."mission_interval_min_minutes" AND "couple_settings"."mission_interval_max_minutes" <= 240);
