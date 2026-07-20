ALTER TABLE "board_threads" ALTER COLUMN "color" SET DEFAULT 'warm-brown';--> statement-breakpoint
ALTER TABLE "board_threads" ADD COLUMN "mode" varchar(20) DEFAULT 'hanging' NOT NULL;--> statement-breakpoint
ALTER TABLE "board_threads" ADD CONSTRAINT "board_threads_mode_check" CHECK ("board_threads"."mode" IN ('hanging', 'linking'));
