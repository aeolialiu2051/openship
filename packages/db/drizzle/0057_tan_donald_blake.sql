ALTER TABLE "project" ADD COLUMN "route_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_project_route_key" ON "project" USING btree ("route_key") WHERE "project"."route_key" IS NOT NULL;