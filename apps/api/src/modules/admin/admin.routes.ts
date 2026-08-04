/** Global instance-administration API. */
import { Hono } from "hono";
import { authMiddleware } from "../../middleware";
import { secureRouter } from "../../lib/secure-router";
import { requireInstanceAdmin } from "./admin.middleware";
import * as controller from "./admin.controller";

const r = secureRouter(new Hono(), {
  module: "admin",
  basePath: "/api/admin",
});

// Instance administration is deliberately outside organization-scoped
// permission tags: these endpoints read and mutate resources across every
// organization. Classify them explicitly as self-authenticated routes, then
// apply the canonical browser-session + instance-admin gate in the handler
// chain. This mirrors internal-token routes that use secureRouter.public while
// still enforcing their own stronger authentication middleware.
const instanceAdminRoute = {
  reason: "Instance-admin endpoint protected by authMiddleware and requireInstanceAdmin",
  rateLimit: "read-authed" as const,
};

r.public("get", "/overview", instanceAdminRoute, authMiddleware, requireInstanceAdmin, controller.overview);
r.public("get", "/users", instanceAdminRoute, authMiddleware, requireInstanceAdmin, controller.users);
r.public(
  "patch",
  "/users/:id/plan",
  { ...instanceAdminRoute, rateLimit: "write-authed" },
  authMiddleware,
  requireInstanceAdmin,
  controller.updateUserPlan,
);
r.public("get", "/apps", instanceAdminRoute, authMiddleware, requireInstanceAdmin, controller.applications);
r.public("post", "/apps/:id/suspend", instanceAdminRoute, authMiddleware, requireInstanceAdmin, controller.suspendApplication);
r.public("post", "/apps/:id/resume", instanceAdminRoute, authMiddleware, requireInstanceAdmin, controller.resumeApplication);
r.public("get", "/access-logs", instanceAdminRoute, authMiddleware, requireInstanceAdmin, controller.accessLogs);
r.public("get", "/activity-logs", instanceAdminRoute, authMiddleware, requireInstanceAdmin, controller.activityLogs);
r.public(
  "get",
  "/runtime-config",
  instanceAdminRoute,
  authMiddleware,
  requireInstanceAdmin,
  controller.runtimeConfig,
);
r.public(
  "patch",
  "/runtime-config",
  { ...instanceAdminRoute, rateLimit: "write-authed" },
  authMiddleware,
  requireInstanceAdmin,
  controller.updateRuntimeConfig,
);

export const adminRoutes = r.hono;
