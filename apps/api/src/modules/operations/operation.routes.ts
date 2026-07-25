import { Hono } from "hono";
import { secureRouter } from "../../lib/secure-router";
import {
  cloudOperationProxy,
  cloudOperationProxyByQuery,
} from "../../lib/cloud/project-router";
import * as ctrl from "./operation.controller";

const r = secureRouter(new Hono(), {
  module: "operations",
  basePath: "/api/operations",
});

r.get(
  "/active",
  {
    tag: "operation:read",
    mcp: { description: "Find the active background operation for a resource." },
  },
  cloudOperationProxyByQuery,
  ctrl.getActive,
);

r.get(
  "/:id",
  {
    tag: "operation:read",
    mcp: { description: "Get the durable status and progress of a background operation." },
  },
  cloudOperationProxy,
  ctrl.getById,
);

export const operationRoutes = r.hono;
