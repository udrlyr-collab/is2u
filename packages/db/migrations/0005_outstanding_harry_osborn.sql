DROP INDEX "memories_mission_uidx";--> statement-breakpoint
DROP INDEX "memories_visible_idx";--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "pending_replacement" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "template_id" varchar(100);--> statement-breakpoint
CREATE INDEX "memories_mission_idx" ON "memories" USING btree ("mission_id","created_at");--> statement-breakpoint
CREATE INDEX "memories_visible_idx" ON "memories" USING btree ("deleted_at","pending_replacement","created_at");