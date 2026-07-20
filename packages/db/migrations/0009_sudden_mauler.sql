CREATE TYPE "public"."couple_invitation_status" AS ENUM('pending', 'accepted', 'declined', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."couple_status" AS ENUM('active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."user_gender" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TABLE "couple_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"pair_key" varchar(73) NOT NULL,
	"status" "couple_invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "couple_invitations_not_self" CHECK ("couple_invitations"."sender_id" <> "couple_invitations"."recipient_id")
);
--> statement-breakpoint
CREATE TABLE "couple_members" (
	"couple_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "couples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "couple_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "couples_end_state" CHECK (("couples"."status" = 'active' AND "couples"."ended_at" IS NULL) OR ("couples"."status" = 'ended' AND "couples"."ended_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "couple_settings" DROP CONSTRAINT "couple_settings_singleton";--> statement-breakpoint
CREATE SEQUENCE "couple_settings_id_seq" OWNED BY "couple_settings"."id";--> statement-breakpoint
SELECT setval('couple_settings_id_seq', GREATEST((SELECT COALESCE(MAX("id"), 1) FROM "couple_settings"), 1));--> statement-breakpoint
ALTER TABLE "couple_settings" ALTER COLUMN "id" SET DEFAULT nextval('couple_settings_id_seq');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "couple_settings" ADD COLUMN "couple_id" uuid;--> statement-breakpoint
ALTER TABLE "date_events" ADD COLUMN "couple_id" uuid;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "couple_id" uuid;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "couple_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gender" "user_gender";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "credentials_activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "users" SET "gender" = CASE WHEN "role_label" = '여자친구' THEN 'female'::"user_gender" WHEN "role_label" = '남자친구' THEN 'male'::"user_gender" ELSE NULL END;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "gender" SET NOT NULL;--> statement-breakpoint
INSERT INTO "couples" ("id", "status", "started_at", "created_at", "updated_at") VALUES ('7f88cb2e-6f6d-4bfd-a0a5-7d55c31f3cd1', 'active', COALESCE((SELECT MIN("created_at") FROM "users"), now()), now(), now());--> statement-breakpoint
INSERT INTO "couple_members" ("couple_id", "user_id", "joined_at") SELECT '7f88cb2e-6f6d-4bfd-a0a5-7d55c31f3cd1', "id", "created_at" FROM "users" WHERE "id" IN ('8f35b489-0d7d-48ad-b45c-598b9a9f0560', '8b871773-c4e1-439e-9272-e7ed386ee32b');--> statement-breakpoint
UPDATE "couple_settings" SET "couple_id" = '7f88cb2e-6f6d-4bfd-a0a5-7d55c31f3cd1' WHERE "couple_id" IS NULL;--> statement-breakpoint
UPDATE "date_events" SET "couple_id" = '7f88cb2e-6f6d-4bfd-a0a5-7d55c31f3cd1' WHERE "couple_id" IS NULL;--> statement-breakpoint
UPDATE "missions" SET "couple_id" = '7f88cb2e-6f6d-4bfd-a0a5-7d55c31f3cd1' WHERE "couple_id" IS NULL;--> statement-breakpoint
UPDATE "memories" SET "couple_id" = '7f88cb2e-6f6d-4bfd-a0a5-7d55c31f3cd1' WHERE "couple_id" IS NULL;--> statement-breakpoint
ALTER TABLE "couple_settings" ALTER COLUMN "couple_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "date_events" ALTER COLUMN "couple_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "missions" ALTER COLUMN "couple_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "couple_invitations" ADD CONSTRAINT "couple_invitations_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couple_invitations" ADD CONSTRAINT "couple_invitations_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couple_members" ADD CONSTRAINT "couple_members_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couple_members" ADD CONSTRAINT "couple_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couples" ADD CONSTRAINT "couples_ended_by_users_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "couple_invitations_pending_pair_uidx" ON "couple_invitations" USING btree ("pair_key") WHERE "couple_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "couple_invitations_recipient_idx" ON "couple_invitations" USING btree ("recipient_id","status","created_at");--> statement-breakpoint
CREATE INDEX "couple_invitations_sender_idx" ON "couple_invitations" USING btree ("sender_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "couple_members_pair_uidx" ON "couple_members" USING btree ("couple_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "couple_members_one_active_uidx" ON "couple_members" USING btree ("user_id") WHERE "couple_members"."left_at" IS NULL;--> statement-breakpoint
CREATE INDEX "couple_members_couple_idx" ON "couple_members" USING btree ("couple_id","left_at");--> statement-breakpoint
ALTER TABLE "couple_settings" ADD CONSTRAINT "couple_settings_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_events" ADD CONSTRAINT "date_events_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "couple_settings_couple_uidx" ON "couple_settings" USING btree ("couple_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uidx" ON "users" USING btree ("username");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_normalized" CHECK ("users"."username" IS NULL OR "users"."username" = lower("users"."username"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_credentials_complete" CHECK (("users"."username" IS NULL AND "users"."password_hash" IS NULL AND "users"."credentials_activated_at" IS NULL) OR ("users"."username" IS NOT NULL AND "users"."password_hash" IS NOT NULL AND "users"."credentials_activated_at" IS NOT NULL));
