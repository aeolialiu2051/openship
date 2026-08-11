-- Repair installations that applied the initial edge projection with a unique
-- domain.managed_key index. One project intentionally shares its unique
-- project.route_key across multiple service hostnames.
DROP INDEX IF EXISTS "uq_domain_managed_key";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_domain_managed_key";--> statement-breakpoint
CREATE INDEX "idx_domain_managed_key" ON "domain" ("managed_key") WHERE "managed_key" IS NOT NULL;
