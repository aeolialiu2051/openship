import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organization } from "./organization";

/**
 * Authenticated dashboard page views for instance-level product operations.
 *
 * Only the pathname is stored — never query parameters, request bodies, or
 * page content. Rows are intentionally independent from organization audit
 * events: visits describe product usage; audit events describe mutations.
 */
export const userAccessLog = pgTable(
  "user_access_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    sessionId: text("session_id"),
    path: text("path").notNull(),
    referrer: text("referrer"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("user_access_log_created_idx").on(t.createdAt),
    index("user_access_log_user_created_idx").on(t.userId, t.createdAt),
    index("user_access_log_org_created_idx").on(t.organizationId, t.createdAt),
    index("user_access_log_path_created_idx").on(t.path, t.createdAt),
  ],
);

export type UserAccessLog = typeof userAccessLog.$inferSelect;
export type NewUserAccessLog = typeof userAccessLog.$inferInsert;
