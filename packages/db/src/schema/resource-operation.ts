import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organization } from "./organization";
import { user } from "./auth";

/**
 * Durable background operation for slow, externally-visible resource work.
 *
 * The resource reference deliberately has no FK: successful deletion removes
 * the project/deployment row, while the operation must remain queryable so the
 * dashboard can show the final outcome and operators can diagnose cleanup.
 */
export const resourceOperation = pgTable(
  "resource_operation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),

    /** project_delete | deployment_delete */
    kind: text("kind").notNull(),
    /** project | deployment */
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),

    /** queued | running | completed | completed_with_warnings | failed | needs_action */
    status: text("status").notNull().default("queued"),
    /** Stable machine-readable phase, e.g. destroying_runtime. */
    currentStep: text("current_step"),
    progressCurrent: integer("progress_current").notNull().default(0),
    progressTotal: integer("progress_total").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),

    /** Immutable enqueue options (force, wipeVolumes, forceOrphan, etc.). */
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    /** Final result or structured intermediate details safe for the UI. */
    result: jsonb("result").$type<Record<string, unknown>>(),
    errorCode: text("error_code"),
    /** Truncated by the repository to keep task rows bounded. */
    errorMessage: text("error_message"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    /** Heartbeat/state transition timestamp used for recovery and diagnostics. */
    lastEventAt: timestamp("last_event_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_resource_operation_org_created").on(
      table.organizationId,
      table.createdAt,
    ),
    index("idx_resource_operation_queue")
      .on(table.status, table.createdAt)
      .where(sql`${table.status} = 'queued'`),
    // Repeated DELETEs must reuse the same durable operation instead of racing
    // a second cleanup over the same resource. needs_action remains active so a
    // force-orphan/retry action updates the same operation history.
    uniqueIndex("uq_resource_operation_active")
      .on(table.organizationId, table.kind, table.resourceId)
      .where(sql`${table.status} IN ('queued','running','needs_action')`),
  ],
);
