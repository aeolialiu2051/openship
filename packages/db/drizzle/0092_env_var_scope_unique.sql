-- Secret provisioning uses INSERT .. ON CONFLICT DO NOTHING so concurrent
-- deploys cannot mint competing values for the same environment variable.
-- Keep the most recently updated row if an older installation accumulated
-- duplicates before this invariant existed.
DELETE FROM "env_var" older
USING "env_var" newer
WHERE older."project_id" = newer."project_id"
  AND older."environment" = newer."environment"
  AND COALESCE(older."service_id", '') = COALESCE(newer."service_id", '')
  AND older."key" = newer."key"
  AND (older."updated_at", older."id") < (newer."updated_at", newer."id");--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_env_var_scope_key"
ON "env_var" ("project_id", "environment", COALESCE("service_id", ''), "key");
