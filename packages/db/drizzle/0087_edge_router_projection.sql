-- Edge routing projection fields. Custom domain verification/SSL columns are
-- intentionally retained and no existing custom hostname is rewritten.
ALTER TABLE "domain" ADD COLUMN IF NOT EXISTS "managed_key" text;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN IF NOT EXISTS "route_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN IF NOT EXISTS "route_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN IF NOT EXISTS "route_reconciled_at" timestamp;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "routing_id" text;--> statement-breakpoint

-- Backfill legacy rows deterministically before adding the unique index. Hex is
-- a DNS-safe subset of the routing-id alphabet. New rows use the repository's
-- cryptographically random allocator.
UPDATE "servers"
SET "routing_id" = lower(substr(md5("id"), 1, 8))
WHERE "routing_id" IS NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_domain_hostname_lower" ON "domain" (lower("hostname"));--> statement-breakpoint
-- A project owns one unique route_key, shared by all of its service hostnames.
-- Domain managed_key is therefore intentionally non-unique.
CREATE INDEX IF NOT EXISTS "idx_domain_managed_key" ON "domain" ("managed_key") WHERE "managed_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_domain_route_reconcile" ON "domain" ("domain_type", "route_status", "updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_servers_routing_id" ON "servers" ("routing_id") WHERE "routing_id" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "domain" DROP CONSTRAINT IF EXISTS "domain_route_status_check";--> statement-breakpoint
ALTER TABLE "domain" ADD CONSTRAINT "domain_route_status_check"
  CHECK ("route_status" IN ('pending', 'active', 'disabled', 'deleting', 'failed'));--> statement-breakpoint
ALTER TABLE "domain" DROP CONSTRAINT IF EXISTS "domain_route_version_check";--> statement-breakpoint
ALTER TABLE "domain" ADD CONSTRAINT "domain_route_version_check" CHECK ("route_version" >= 1);--> statement-breakpoint
ALTER TABLE "domain" DROP CONSTRAINT IF EXISTS "domain_managed_key_check";--> statement-breakpoint
ALTER TABLE "domain" ADD CONSTRAINT "domain_managed_key_check"
  CHECK ("managed_key" IS NULL OR "managed_key" ~ '^[a-z0-9]{8}$');--> statement-breakpoint
ALTER TABLE "servers" DROP CONSTRAINT IF EXISTS "servers_routing_id_check";--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_routing_id_check"
  CHECK ("routing_id" IS NULL OR "routing_id" ~ '^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$');
