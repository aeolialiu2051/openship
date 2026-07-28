ALTER TABLE "domain_settings" ADD COLUMN "id" text;--> statement-breakpoint
UPDATE "domain_settings" SET "id" = "organization_id" || ':' || "domain" WHERE "id" IS NULL;--> statement-breakpoint
ALTER TABLE "domain_settings" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "domain_settings" DROP CONSTRAINT "domain_settings_pkey";--> statement-breakpoint
ALTER TABLE "domain_settings" ADD CONSTRAINT "domain_settings_pkey" PRIMARY KEY("id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_domain_settings_organization_domain" ON "domain_settings" USING btree ("organization_id","domain");
