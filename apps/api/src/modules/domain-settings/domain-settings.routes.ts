import { Hono } from "hono";
import { secureRouter } from "../../lib/secure-router";
import * as ctrl from "./domain-settings.controller";

const r = secureRouter(new Hono(), {
  module: "domain-settings",
  basePath: "/api/domain-settings",
});

r.get("/", { tag: "settings:read" }, ctrl.list);
r.post("/", { tag: "settings:write" }, ctrl.create);
r.post("/test", { tag: "settings:write" }, ctrl.test);
r.put("/:id", { tag: "settings:write" }, ctrl.update);
r.post("/:id/verify", { tag: "settings:write" }, ctrl.verify);
r.delete("/:id", { tag: "settings:admin" }, ctrl.remove);

export const domainSettingsRoutes = r.hono;
