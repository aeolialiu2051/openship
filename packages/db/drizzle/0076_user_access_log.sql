CREATE TABLE "user_access_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"organization_id" text,
	"session_id" text,
	"path" text NOT NULL,
	"referrer" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_access_log" ADD CONSTRAINT "user_access_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_access_log" ADD CONSTRAINT "user_access_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "user_access_log_created_idx" ON "user_access_log" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "user_access_log_user_created_idx" ON "user_access_log" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "user_access_log_org_created_idx" ON "user_access_log" USING btree ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX "user_access_log_path_created_idx" ON "user_access_log" USING btree ("path","created_at");
