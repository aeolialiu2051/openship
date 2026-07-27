/**
 * User-server-safe subset of /api/migration.
 *
 * Cloud deployments with USER_SERVERS_ENABLED may inspect Docker on an
 * organization-owned SSH server, but do not inherit the full self-hosted
 * migration surface (adopt/move/cutover and its in-process recovery model).
 */
import { Hono } from "hono";
import { userServersOnly } from "../../middleware";
import { secureRouter } from "../../lib/secure-router";
import * as migration from "./migration.controller";

const r = secureRouter(new Hono(), {
  module: "migration",
  basePath: "/api/migration",
  ids: { server: "serverId" },
});

r.use("*", userServersOnly);

r.post(
  "/scan",
  { tag: "server:write", collection: true, readOnly: true, rateLimit: "server-probe" },
  migration.scanServer,
);
r.get(
  "/scan/stream",
  { tag: "server:write", collection: true, readOnly: true, rateLimit: "server-probe" },
  migration.scanServerStream,
);

export const serverMigrationRoutes = r.hono;
