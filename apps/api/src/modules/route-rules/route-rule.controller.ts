/**
 * Route rules controller — per-project native Traefik middlewares.
 *
 *   GET    /api/projects/:id/route-rules
 *   POST   /api/projects/:id/route-rules
 *   PATCH  /api/projects/:id/route-rules/:ruleId
 *   DELETE /api/projects/:id/route-rules/:ruleId
 *
 * The DB is the source of truth. Supported fields compile to native Traefik
 * Docker labels on the next deployment; Docker labels cannot be mutated live.
 */

import type { Context } from "hono";
import { isIP } from "node:net";
import { repos } from "@repo/db";
import type { RouteRuleSpec } from "@repo/core";
import { getRequestContext } from "../../lib/request-context";
import { param } from "../../lib/controller-helpers";

/**
 * Sanitize a client-supplied spec into the trusted RouteRuleSpec shape.
 * Only capabilities implemented by native Traefik middlewares are accepted;
 * unsupported legacy OpenResty fields are intentionally discarded.
 */
export function sanitizeSpec(input: unknown): RouteRuleSpec {
  const spec = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: RouteRuleSpec = {};

  // Reject empty/oversized/control-char strings; cap list length.
  const strList = (v: unknown, maxLen = 64): string[] | undefined =>
    Array.isArray(v)
      ? v
          .filter(
            (s): s is string =>
              typeof s === "string" &&
              s.length > 0 &&
              s.length <= maxLen &&
              !/[\u0000-\u001f\u007f]/.test(s),
          )
          .slice(0, 256)
      : undefined;

  const ipOrCidr = (value: string): boolean => {
    const [address, prefix, extra] = value.split("/");
    if (extra !== undefined || !address) return false;
    const version = isIP(address);
    if (!version) return false;
    if (prefix === undefined) return true;
    if (!/^\d+$/.test(prefix)) return false;
    const bits = Number(prefix);
    return bits >= 0 && bits <= (version === 4 ? 32 : 128);
  };

  const rl = spec.rateLimit as Record<string, unknown> | undefined;
  if (rl && typeof rl === "object") {
    const rps = Number(rl.rps);
    const burst = Number(rl.burst);
    if (Number.isFinite(rps) && rps > 0) {
      out.rateLimit = {
        rps: Math.floor(rps),
        burst: Number.isFinite(burst) && burst >= 0 ? Math.floor(burst) : 0,
        key: "ip",
      };
    }
  }

  const ipAllowList = spec.ipAllowList as Record<string, unknown> | undefined;
  if (ipAllowList && typeof ipAllowList === "object") {
    const sourceRange = strList(ipAllowList.sourceRange)?.filter(ipOrCidr);
    if (sourceRange?.length) out.ipAllowList = { sourceRange };
  }

  const inFlightReq = spec.inFlightReq as Record<string, unknown> | undefined;
  if (inFlightReq && typeof inFlightReq === "object") {
    const amount = Number(inFlightReq.amount);
    if (Number.isFinite(amount) && amount > 0) {
      out.inFlightReq = { amount: Math.min(100_000, Math.floor(amount)) };
    }
  }

  return out;
}

function normalizePathPrefix(p: string | null | undefined): string | null {
  if (!p) return null;
  const s = p.trim();
  if (!s || s === "/") return null;
  const withSlash = s.startsWith("/") ? s : `/${s}`;
  return withSlash.slice(0, 512);
}

async function loadProject(c: Context) {
  const organizationId = getRequestContext(c).organizationId;
  const project = await repos.project.findById(param(c, "id"));
  if (!project || project.organizationId !== organizationId) return null;
  return project;
}

export async function listRouteRules(c: Context) {
  const project = await loadProject(c);
  if (!project) return c.json({ error: "Project not found" }, 404);
  const rules = await repos.routeRule.listByProject(project.id);
  return c.json({ rules });
}

export async function createRouteRule(c: Context) {
  const project = await loadProject(c);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const body = await c.req.json<{
    domainId?: string | null;
    pathPrefix?: string | null;
    spec?: unknown;
    enabled?: boolean;
  }>();

  if (body.domainId) {
    const dom = await repos.domain.findById(body.domainId);
    if (!dom || dom.projectId !== project.id) {
      return c.json({ error: "domainId does not belong to this project" }, 400);
    }
  }

  const spec = sanitizeSpec(body.spec);
  if (Object.keys(spec).length === 0) {
    return c.json({ error: "At least one supported Traefik rule is required" }, 400);
  }

  const rule = await repos.routeRule.create({
    organizationId: project.organizationId,
    projectId: project.id,
    domainId: body.domainId ?? null,
    pathPrefix: normalizePathPrefix(body.pathPrefix),
    spec,
    enabled: body.enabled ?? true,
  });

  return c.json({ rule, requiresRedeploy: true }, 201);
}

export async function updateRouteRule(c: Context) {
  const project = await loadProject(c);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const ruleId = param(c, "ruleId");
  const existing = await repos.routeRule.get(ruleId);
  if (!existing || existing.projectId !== project.id) {
    return c.json({ error: "Rule not found" }, 404);
  }

  const body = await c.req.json<{
    domainId?: string | null;
    pathPrefix?: string | null;
    spec?: unknown;
    enabled?: boolean;
  }>();

  const patch: Record<string, unknown> = {};
  if (body.domainId !== undefined) {
    if (body.domainId) {
      const dom = await repos.domain.findById(body.domainId);
      if (!dom || dom.projectId !== project.id) {
        return c.json({ error: "domainId does not belong to this project" }, 400);
      }
    }
    patch.domainId = body.domainId ?? null;
  }
  if (body.pathPrefix !== undefined) patch.pathPrefix = normalizePathPrefix(body.pathPrefix);
  if (body.spec !== undefined) patch.spec = sanitizeSpec(body.spec);
  if (body.enabled !== undefined) patch.enabled = !!body.enabled;

  await repos.routeRule.update(ruleId, patch);
  const rule = await repos.routeRule.get(ruleId);
  return c.json({ rule, requiresRedeploy: true });
}

export async function deleteRouteRule(c: Context) {
  const project = await loadProject(c);
  if (!project) return c.json({ error: "Project not found" }, 404);

  await repos.routeRule.removeForProject(project.id, param(c, "ruleId"));
  return c.json({ success: true, requiresRedeploy: true });
}
