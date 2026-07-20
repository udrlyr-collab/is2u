ALTER TABLE "couple_members" ALTER COLUMN "couple_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "missions" ALTER COLUMN "couple_id" DROP NOT NULL;
--> statement-breakpoint
UPDATE "users" SET "role" = 'admin', "updated_at" = now() WHERE "id" = '8b871773-c4e1-439e-9272-e7ed386ee32b';
