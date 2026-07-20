ALTER TYPE "public"."account_status" ADD VALUE 'deleted';--> statement-breakpoint
ALTER TABLE "couples" ADD COLUMN "disconnected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "couples" ADD COLUMN "initiated_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "couples" ADD COLUMN "initiated_by_admin_id" uuid;--> statement-breakpoint
ALTER TABLE "couples" ADD COLUMN "disconnect_reason" varchar(300);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "couples" ADD CONSTRAINT "couples_initiated_by_user_id_users_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couples" ADD CONSTRAINT "couples_initiated_by_admin_id_users_id_fk" FOREIGN KEY ("initiated_by_admin_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;