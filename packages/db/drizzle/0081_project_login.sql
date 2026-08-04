CREATE TABLE IF NOT EXISTS "project_login" (
  "project_id" text PRIMARY KEY NOT NULL,
  "service_id" text,
  "url" text NOT NULL,
  "username" text NOT NULL,
  "password_encrypted" text,
  "username_env_key" text,
  "password_env_key" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "project_login_project_id_project_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "public"."project"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "project_login_service_id_service_id_fk"
    FOREIGN KEY ("service_id") REFERENCES "public"."service"("id")
    ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_login_service" ON "project_login" USING btree ("service_id");
