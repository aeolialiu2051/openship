import { Hono } from "hono";
import { secureRouter } from "../../lib/secure-router";
import { authMiddleware } from "../../middleware";
import * as controller from "./telemetry.controller";

const r = secureRouter(new Hono(), {
  module: "telemetry",
  basePath: "/api/telemetry",
});

// Permission-neutral but authenticated: every signed-in role may record its
// own page view, while authMiddleware supplies trusted identity/request data.
r.public(
  "post",
  "/page-view",
  {
    reason: "Authenticated page-view telemetry; authMiddleware is explicitly mounted",
    rateLimit: "default-anon",
  },
  authMiddleware,
  controller.pageView,
);

export const telemetryRoutes = r.hono;
