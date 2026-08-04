import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { project } from "./project";
import { service } from "./service";

/** Optional human login shown on a project's Overview page. */
export const projectLogin = pgTable(
  "project_login",
  {
    projectId: text("project_id")
      .primaryKey()
      .references(() => project.id, { onDelete: "cascade" }),
    /** Service that consumes the login env vars, when applicable. */
    serviceId: text("service_id").references(() => service.id, { onDelete: "set null" }),
    /** Full app homepage/login URL, including a non-root path when needed. */
    url: text("url").notNull(),
    username: text("username").notNull(),
    /** Application-encrypted plaintext password. Nullable after cross-host restore. */
    passwordEncrypted: text("password_encrypted"),
    usernameEnvKey: text("username_env_key"),
    passwordEnvKey: text("password_env_key"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("idx_project_login_service").on(table.serviceId)],
);
