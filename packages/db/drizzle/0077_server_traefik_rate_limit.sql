ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "traefik_rate_limit_rps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "traefik_rate_limit_burst" integer DEFAULT 0 NOT NULL;
