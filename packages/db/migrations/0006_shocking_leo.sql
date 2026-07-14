ALTER TABLE "memories" ADD COLUMN "first_pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "memories" SET "first_pinned_at" = "created_at", "updated_at" = "created_at";--> statement-breakpoint
ALTER TABLE "memories" ALTER COLUMN "first_pinned_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "memories" ALTER COLUMN "first_pinned_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "memories" ALTER COLUMN "updated_at" SET NOT NULL;
