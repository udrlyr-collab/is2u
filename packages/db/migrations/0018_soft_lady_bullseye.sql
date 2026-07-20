DROP INDEX "board_items_memory_uidx";--> statement-breakpoint
CREATE INDEX "board_items_memory_idx" ON "board_items" USING btree ("board_id","memory_id");