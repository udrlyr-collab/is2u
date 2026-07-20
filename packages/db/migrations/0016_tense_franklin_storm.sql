CREATE TABLE "board_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" bigint NOT NULL,
	"status" varchar(20) DEFAULT 'uploading' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_thread_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_items" DROP CONSTRAINT "board_items_one_subject_check";--> statement-breakpoint
ALTER TABLE "board_items" DROP CONSTRAINT "board_items_size_check";--> statement-breakpoint
ALTER TABLE "board_threads" DROP CONSTRAINT "board_threads_distinct_items_check";--> statement-breakpoint
ALTER TABLE "memory_boards" DROP CONSTRAINT "memory_boards_zoom_check";--> statement-breakpoint
ALTER TABLE "board_threads" DROP CONSTRAINT "board_threads_first_item_id_board_items_id_fk";
--> statement-breakpoint
ALTER TABLE "board_threads" DROP CONSTRAINT "board_threads_second_item_id_board_items_id_fk";
--> statement-breakpoint
DROP INDEX "board_threads_pair_uidx";--> statement-breakpoint
DROP INDEX "memory_boards_owner_uidx";--> statement-breakpoint
ALTER TABLE "board_threads" ALTER COLUMN "first_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "board_threads" ALTER COLUMN "second_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "board_items" ADD COLUMN "asset_id" uuid;--> statement-breakpoint
ALTER TABLE "board_items" ADD COLUMN "element_type" varchar(20) DEFAULT 'memory' NOT NULL;--> statement-breakpoint
ALTER TABLE "board_items" ADD COLUMN "text_content" varchar(500);--> statement-breakpoint
ALTER TABLE "board_items" ADD COLUMN "style_json" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "board_threads" ADD COLUMN "start_x" integer DEFAULT 260 NOT NULL;--> statement-breakpoint
ALTER TABLE "board_threads" ADD COLUMN "start_y" integer DEFAULT 280 NOT NULL;--> statement-breakpoint
ALTER TABLE "board_threads" ADD COLUMN "end_x" integer DEFAULT 1540 NOT NULL;--> statement-breakpoint
ALTER TABLE "board_threads" ADD COLUMN "end_y" integer DEFAULT 280 NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_boards" ADD COLUMN "title" varchar(80) DEFAULT '새 보드' NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_boards" ADD COLUMN "description" varchar(300);--> statement-breakpoint
ALTER TABLE "memory_boards" ADD COLUMN "visibility" varchar(20) DEFAULT 'partner' NOT NULL;--> statement-breakpoint
ALTER TABLE "board_assets" ADD CONSTRAINT "board_assets_board_id_memory_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."memory_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_assets" ADD CONSTRAINT "board_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_thread_items" ADD CONSTRAINT "board_thread_items_thread_id_board_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."board_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_thread_items" ADD CONSTRAINT "board_thread_items_item_id_board_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."board_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_assets_board_idx" ON "board_assets" USING btree ("board_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "board_assets_storage_uidx" ON "board_assets" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "board_thread_items_pair_uidx" ON "board_thread_items" USING btree ("thread_id","item_id");--> statement-breakpoint
CREATE INDEX "board_thread_items_order_idx" ON "board_thread_items" USING btree ("thread_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "board_items_asset_uidx" ON "board_items" USING btree ("board_id","asset_id");--> statement-breakpoint
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_asset_id_board_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."board_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_threads" ADD CONSTRAINT "board_threads_first_item_id_board_items_id_fk" FOREIGN KEY ("first_item_id") REFERENCES "public"."board_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_threads" ADD CONSTRAINT "board_threads_second_item_id_board_items_id_fk" FOREIGN KEY ("second_item_id") REFERENCES "public"."board_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_boards_owner_updated_idx" ON "memory_boards" USING btree ("owner_id","updated_at");--> statement-breakpoint
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_size_check" CHECK ("board_items"."width" BETWEEN 80 AND 720 AND "board_items"."height" BETWEEN 60 AND 620);--> statement-breakpoint
ALTER TABLE "memory_boards" ADD CONSTRAINT "memory_boards_zoom_check" CHECK ("memory_boards"."zoom_permille" >= 500 AND "memory_boards"."zoom_permille" <= 2400);
--> statement-breakpoint
UPDATE "memory_boards" SET "title" = '첫 번째 보드' WHERE "title" = '새 보드';
--> statement-breakpoint
UPDATE "board_items" SET "element_type" = 'bundle' WHERE "group_id" IS NOT NULL;
