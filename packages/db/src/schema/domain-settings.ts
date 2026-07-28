import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./organization";

/**
 * Organization-level DNS automation settings.
 *
 * A workspace may own multiple Cloudflare zones. Any custom deployment hostname
 * inside one of those zones can be created/updated automatically by the backend.
 * The API token is encrypted by the API before it reaches this table and is
 * never returned to dashboard clients or deployed workloads.
 */
export const domainSettings = pgTable(
  "domain_settings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    cloudflareZoneId: text("cloudflare_zone_id").notNull(),
    cloudflareApiTokenEncrypted: text("cloudflare_api_token_encrypted").notNull(),
    cloudflareProxy: boolean("cloudflare_proxy").notNull().default(true),
    verifiedAt: timestamp("verified_at"),
    lastVerificationError: text("last_verification_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_domain_settings_domain").on(t.domain),
    uniqueIndex("uq_domain_settings_organization_domain").on(t.organizationId, t.domain),
  ],
);
