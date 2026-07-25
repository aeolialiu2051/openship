CREATE TABLE "resource_operation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_user_id" text,
	"kind" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"current_step" text,
	"progress_current" integer DEFAULT 0 NOT NULL,
	"progress_total" integer DEFAULT 0 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"last_event_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resource_operation" ADD CONSTRAINT "resource_operation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_operation" ADD CONSTRAINT "resource_operation_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_resource_operation_org_created" ON "resource_operation" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_resource_operation_queue" ON "resource_operation" USING btree ("status","created_at") WHERE "resource_operation"."status" = 'queued';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_resource_operation_active" ON "resource_operation" USING btree ("organization_id","kind","resource_id") WHERE "resource_operation"."status" IN ('queued','running','needs_action');