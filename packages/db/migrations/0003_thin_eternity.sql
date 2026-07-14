ALTER TABLE "date_events" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "date_events_visible_idx" ON "date_events" USING btree ("deleted_at","start_at");