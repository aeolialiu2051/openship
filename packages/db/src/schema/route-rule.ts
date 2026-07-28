import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import type { RouteRuleSpec } from "@repo/core";
import { organization } from "./organization";
import { project } from "./project";
import { domain } from "./domain";

// ─── Route rules ───────────────────────────────────────────────────────────────

/**
 * Per-route edge rules compiled into native Traefik routers and middlewares at
 * deployment time. The DB is the source of truth; the JSONB body allows new
 * middleware capabilities without a database migration.
 *
 * Scope: a rule applies to `domainId` (a specific hostname) or, when null, to
 * ALL of the project's hostnames; `pathPrefix` narrows it to a path (null/"/" =
 * whole host). 1:N per project/host/path, hence its own table (the flexible
 * rule body is the `spec` JSONB, matching the `service.advanced` idiom).
 */
export const routeRule = pgTable("route_rule", {
  id: text("id").primaryKey(), // "rr_..."
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  /** Specific hostname this rule targets; null = every hostname of the project. */
  domainId: text("domain_id").references(() => domain.id, { onDelete: "cascade" }),
  /** Path-prefix scope (null / "/" = the whole host). */
  pathPrefix: text("path_prefix"),
  /** The rule body — see RouteRuleSpec (Traefik middleware settings). */
  spec: jsonb("spec").$type<RouteRuleSpec>().notNull().default({}),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_route_rule_project").on(t.projectId),
  index("idx_route_rule_domain").on(t.domainId),
]);
