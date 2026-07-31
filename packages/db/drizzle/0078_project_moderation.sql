ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "moderation_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "suspended_reason" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_moderation_status" ON "project" USING btree ("moderation_status");
