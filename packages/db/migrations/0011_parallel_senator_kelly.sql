CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended', 'pending_deletion');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "admin_test_dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"admin_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"delivery_status" varchar(20) NOT NULL,
	"failure_code" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "missions" ALTER COLUMN "couple_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_status" "account_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_test_dispatches" ADD CONSTRAINT "admin_test_dispatches_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_test_dispatches" ADD CONSTRAINT "admin_test_dispatches_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_test_dispatches" ADD CONSTRAINT "admin_test_dispatches_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_test_dispatches_mission_uidx" ON "admin_test_dispatches" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "admin_test_dispatches_admin_time_idx" ON "admin_test_dispatches" USING btree ("admin_id","created_at");
