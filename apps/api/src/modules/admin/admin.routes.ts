/** Global instance-administration API. */
import { Hono } from "hono";
import { authMiddleware } from "../../middleware";
import { rateLimiterFor } from "../../middleware/rate-limiter";
import { requireInstanceAdmin } from "./admin.middleware";
import * as controller from "./admin.controller";

export const adminRoutes = new Hono();

adminRoutes.use("*", authMiddleware);
adminRoutes.use("*", rateLimiterFor("read-authed"));
adminRoutes.use("*", requireInstanceAdmin);

adminRoutes.get("/overview", controller.overview);
adminRoutes.get("/users", controller.users);
adminRoutes.get("/access-logs", controller.accessLogs);
adminRoutes.get("/activity-logs", controller.activityLogs);
