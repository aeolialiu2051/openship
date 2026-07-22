/**
 * User-server subset of /api/system.
 *
 * Mounted by local-saas only when CLOUD_MODE is enabled. It intentionally
 * excludes filesystem, instance setup, migration, tunnels, and data-transfer
 * routes from the full self-hosted system router.
 */
import { Hono } from "hono";
import { secureRouter } from "../../lib/secure-router";
import { userServersOnly } from "../../middleware";
import * as serversCtrl from "./servers.controller";
import * as serverCheck from "./server-check.controller";
import * as rateLimit from "./rate-limit.controller";
import * as serverGithub from "../github/server-github.controller";

const r = secureRouter(new Hono(), {
  module: "system",
  basePath: "/api/system",
});

r.use("*", userServersOnly);

r.get("/servers", { tag: "server:list" }, serversCtrl.listServers);
r.get("/servers/:id", { tag: "server:read" }, serversCtrl.getServer);
r.get("/servers/:id/reachability", { tag: "server:read" }, serversCtrl.probeReachability);
r.post("/servers", { tag: "server:write", collection: true }, serversCtrl.createServer);
r.patch("/servers/:id", { tag: "server:write" }, serversCtrl.updateServer);
r.delete("/servers/:id", { tag: "server:admin" }, serversCtrl.deleteServer);

r.get("/servers/:id/rate-limit", { tag: "server:read" }, rateLimit.getRateLimit);
r.patch("/servers/:id/rate-limit", { tag: "server:write" }, rateLimit.updateRateLimit);

r.get("/servers/:id/github", { tag: "server:read" }, serverGithub.getStatus);
r.post("/servers/:id/github/connect", { tag: "server:write" }, serverGithub.startConnect);
r.get("/servers/:id/github/connect/poll", { tag: "server:read" }, serverGithub.pollConnect);
r.put("/servers/:id/github/token", { tag: "server:write" }, serverGithub.putToken);
r.post("/servers/:id/github/ssh-key", { tag: "server:write" }, serverGithub.generateSshKey);
r.put("/servers/:id/github/deploy-key-mode", { tag: "server:write" }, serverGithub.useDeployKeyMode);
r.delete("/servers/:id/github", { tag: "server:write" }, serverGithub.disconnect);

r.post("/test-connection", { tag: "server:write", collection: true }, serverCheck.testConnection);
r.post("/check", { tag: "server:write", collection: true }, serverCheck.checkServer);
r.post("/install", { tag: "server:admin", collection: true }, serverCheck.installComponent);
r.post("/remove", { tag: "server:admin", collection: true }, serverCheck.removeComponent);
r.post("/install/stream", { tag: "server:admin", collection: true }, serverCheck.installStream);
r.post("/install/respond", { tag: "server:admin", collection: true }, serverCheck.installRespond);
r.get("/install/stream", { tag: "server:read", collection: true }, serverCheck.attachInstallStream);
r.get("/install/session", { tag: "server:read", collection: true }, serverCheck.getInstallSession);
r.get("/monitor/stream", { tag: "server:read", collection: true }, serverCheck.monitorStream);

export const serverSystemRoutes = r.hono;
