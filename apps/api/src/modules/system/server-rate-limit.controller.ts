/** Server-wide Traefik rate-limit policy.
 *
 * The database is the source of truth. Docker labels are immutable, so this
 * policy is compiled into every router on the next deployment/redeployment.
 */
import type { Context } from "hono";
import { repos } from "@repo/db";
import { getRequestContext } from "../../lib/request-context";
import { param, assertUserServersEnabled } from "../../lib/controller-helpers";
import { audit, auditContextFrom } from "../../lib/audit";

async function loadServer(c: Context) {
  const organizationId = getRequestContext(c).organizationId;
  return repos.server.getInOrganization(param(c, "id"), organizationId);
}

function configOf(server: { traefikRateLimitRps: number; traefikRateLimitBurst: number }) {
  return {
    rps: Math.max(0, server.traefikRateLimitRps),
    burst: Math.max(0, server.traefikRateLimitBurst),
  };
}

export async function getRateLimit(c: Context) {
  const cloudGuard = assertUserServersEnabled(c);
  if (cloudGuard) return cloudGuard;
  const server = await loadServer(c);
  if (!server) return c.json({ error: "Server not found" }, 404);
  return c.json({ config: configOf(server), requiresRedeploy: true });
}

export async function updateRateLimit(c: Context) {
  const cloudGuard = assertUserServersEnabled(c);
  if (cloudGuard) return cloudGuard;
  const ctx = getRequestContext(c);
  const server = await loadServer(c);
  if (!server) return c.json({ error: "Server not found" }, 404);

  const body = await c.req.json<{ rps?: unknown; burst?: unknown }>();
  const rps = Number(body.rps);
  const burst = Number(body.burst);
  if (!Number.isFinite(rps) || rps < 0 || rps > 1_000_000) {
    return c.json({ error: "rps must be between 0 and 1000000" }, 400);
  }
  if (!Number.isFinite(burst) || burst < 0 || burst > 1_000_000) {
    return c.json({ error: "burst must be between 0 and 1000000" }, 400);
  }

  const nextRps = Math.floor(rps);
  const nextBurst = nextRps > 0 ? Math.floor(burst) : 0;
  const before = configOf(server);
  const updated = await repos.server.update(server.id, {
    traefikRateLimitRps: nextRps,
    traefikRateLimitBurst: nextBurst,
  });
  const config = configOf(updated);

  audit.recordAsync(auditContextFrom(c, ctx.organizationId, ctx.userId), {
    eventType: "server.rate_limit_updated",
    resourceType: "server",
    resourceId: server.id,
    before,
    after: config,
  });

  return c.json({ success: true, config, requiresRedeploy: true });
}
