ALTER TABLE "servers" ADD COLUMN "traefik_network" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "traefik_entrypoint" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "traefik_tls" boolean;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "traefik_cert_resolver" text;
