ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "runtime_started_at" timestamp;--> statement-breakpoint

-- Preserve a useful session anchor for existing running projects. The project
-- update timestamp is the closest durable signal for the most recent manual
-- stop/start; fall back to the active deployment time for untouched rows.
UPDATE "project" AS p
SET "runtime_started_at" = COALESCE(
  p."updated_at",
  (SELECT d."created_at" FROM "deployment" AS d WHERE d."id" = p."active_deployment_id")
)
WHERE p."active" = true
  AND p."active_deployment_id" IS NOT NULL
  AND p."runtime_started_at" IS NULL;
