CREATE TABLE "board_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"memory_id" uuid,
	"group_id" uuid,
	"x" integer DEFAULT 120 NOT NULL,
	"y" integer DEFAULT 120 NOT NULL,
	"width" integer DEFAULT 240 NOT NULL,
	"height" integer DEFAULT 190 NOT NULL,
	"rotation_tenths" integer DEFAULT 0 NOT NULL,
	"z_index" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_items_one_subject_check" CHECK ((("board_items"."memory_id" IS NOT NULL)::int + ("board_items"."group_id" IS NOT NULL)::int) = 1),
	CONSTRAINT "board_items_size_check" CHECK ("board_items"."width" BETWEEN 140 AND 480 AND "board_items"."height" BETWEEN 110 AND 420),
	CONSTRAINT "board_items_rotation_check" CHECK ("board_items"."rotation_tenths" BETWEEN -120 AND 120)
);
--> statement-breakpoint
CREATE TABLE "board_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"first_item_id" uuid NOT NULL,
	"second_item_id" uuid NOT NULL,
	"curve" integer DEFAULT 36 NOT NULL,
	"color" varchar(20) DEFAULT 'muted-red' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_threads_distinct_items_check" CHECK ("board_threads"."first_item_id" <> "board_threads"."second_item_id"),
	CONSTRAINT "board_threads_curve_check" CHECK ("board_threads"."curve" BETWEEN -160 AND 160)
);
--> statement-breakpoint
CREATE TABLE "memory_boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"viewport_x" integer DEFAULT 0 NOT NULL,
	"viewport_y" integer DEFAULT 0 NOT NULL,
	"zoom_permille" integer DEFAULT 1000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_boards_zoom_check" CHECK ("memory_boards"."zoom_permille" >= 500 AND "memory_boards"."zoom_permille" <= 1800)
);
--> statement-breakpoint
CREATE TABLE "memory_group_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(50) NOT NULL,
	"note" varchar(200),
	"representative_memory_id" uuid,
	"style" varchar(20) DEFAULT 'butter' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_board_id_memory_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."memory_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_group_id_memory_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."memory_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_threads" ADD CONSTRAINT "board_threads_board_id_memory_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."memory_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_threads" ADD CONSTRAINT "board_threads_first_item_id_board_items_id_fk" FOREIGN KEY ("first_item_id") REFERENCES "public"."board_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_threads" ADD CONSTRAINT "board_threads_second_item_id_board_items_id_fk" FOREIGN KEY ("second_item_id") REFERENCES "public"."board_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_boards" ADD CONSTRAINT "memory_boards_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_group_items" ADD CONSTRAINT "memory_group_items_group_id_memory_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."memory_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_group_items" ADD CONSTRAINT "memory_group_items_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_groups" ADD CONSTRAINT "memory_groups_board_id_memory_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."memory_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_groups" ADD CONSTRAINT "memory_groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_groups" ADD CONSTRAINT "memory_groups_representative_memory_id_memories_id_fk" FOREIGN KEY ("representative_memory_id") REFERENCES "public"."memories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "board_items_memory_uidx" ON "board_items" USING btree ("board_id","memory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "board_items_group_uidx" ON "board_items" USING btree ("board_id","group_id");--> statement-breakpoint
CREATE INDEX "board_items_board_z_idx" ON "board_items" USING btree ("board_id","z_index");--> statement-breakpoint
CREATE UNIQUE INDEX "board_threads_pair_uidx" ON "board_threads" USING btree ("board_id","first_item_id","second_item_id");--> statement-breakpoint
CREATE INDEX "board_threads_board_idx" ON "board_threads" USING btree ("board_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_boards_owner_uidx" ON "memory_boards" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_group_items_pair_uidx" ON "memory_group_items" USING btree ("group_id","memory_id");--> statement-breakpoint
CREATE INDEX "memory_group_items_order_idx" ON "memory_group_items" USING btree ("group_id","position");--> statement-breakpoint
CREATE INDEX "memory_groups_board_idx" ON "memory_groups" USING btree ("board_id","updated_at");