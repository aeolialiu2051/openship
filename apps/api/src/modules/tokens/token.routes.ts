/**
 * Personal Access Token routes — mounted at /api/tokens in app.ts.
 * Self-scoped: every handler operates on the caller's own tokens (ctx.userId).
 * Gated behind settings read/write so any org member can manage their tokens.
 */

import { Hono } from "hono";
import { tbValidator } from "@hono/typebox-validator";
import { secureRouter } from "../../lib/secure-router";
import * as ctrl from "./token.controller";
import { CreateTokenBody } from "./token.schema";

const r = secureRouter(new Hono(), {
  module: "tokens",
  basePath: "/api/tokens",
});

r.get("/", { tag: "settings:read" }, ctrl.list);
r.post("/", { tag: "settings:write" }, tbValidator("json", CreateTokenBody), ctrl.create);
r.post("/cli-authorize", { tag: "settings:write" }, ctrl.authorizeCli);
r.public(
  "get",
  "/cli-poll",
  { reason: "CLI browser-login poll; protected by unguessable state and PKCE" },
  ctrl.pollCli,
);
r.public(
  "post",
  "/cli-exchange",
  { reason: "CLI one-time authorization-code exchange; protected by PKCE" },
  ctrl.exchangeCli,
);
r.delete("/:id", { tag: "settings:write" }, ctrl.revoke);
r.post("/mcp-authorize", { tag: "settings:write" }, ctrl.authorizeMcpClient);
// Connected MCP clients (OAuth bindings) — list + disconnect (revoke).
r.get("/mcp-clients", { tag: "settings:read" }, ctrl.listMcpClients);
r.delete("/mcp-clients/:clientId", { tag: "settings:write" }, ctrl.disconnectMcpClient);

export const tokenRoutes = r.hono;
