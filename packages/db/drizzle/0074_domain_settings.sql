CREATE TABLE "domain_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"cloudflare_zone_id" text NOT NULL,
	"cloudflare_api_token_encrypted" text NOT NULL,
	"cloudflare_proxy" boolean DEFAULT true NOT NULL,
	"verified_at" timestamp,
	"last_verification_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "domain_settings" ADD CONSTRAINT "domain_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_domain_settings_domain" ON "domain_settings" USING btree ("domain");--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "dns_managed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "dns_provider" text;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "dns_record_id" text;
