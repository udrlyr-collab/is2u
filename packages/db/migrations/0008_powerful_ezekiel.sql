ALTER TABLE "missions" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "purge_after" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "missions_visible_idx" ON "missions" USING btree ("deleted_at","scheduled_at");