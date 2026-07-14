DROP INDEX "missions_date_event_uidx";--> statement-breakpoint
ALTER TABLE "date_events" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "date_events" ADD COLUMN "client_request_id" uuid;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "date_events_client_request_uidx" ON "date_events" USING btree ("client_request_id");--> statement-breakpoint
CREATE INDEX "missions_test_idx" ON "missions" USING btree ("is_test","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "missions_date_event_uidx" ON "missions" USING btree ("date_event_id") WHERE "missions"."is_test" = false;