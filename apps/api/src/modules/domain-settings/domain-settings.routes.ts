import { Hono } from "hono";
import { secureRouter } from "../../lib/secure-router";
import * as ctrl from "./domain-settings.controller";

const r = secureRouter(new Hono(), {
  module: "domain-settings",
  basePath: "/api/domain-settings",
});

r.get("/", { tag: "settings:read" }, ctrl.get);
r.put("/", { tag: "settings:write" }, ctrl.save);
r.post("/verify", { tag: "settings:write" }, ctrl.verify);
r.delete("/", { tag: "settings:admin" }, ctrl.remove);

export const domainSettingsRoutes = r.hono;
