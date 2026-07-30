/**
 * Analytics controller - handlers for analytics + usage + stats endpoints.
 */

import type { Context } from "hono";
import { streamSSE } from "../../lib/sse";
import { getRequestContext } from "../../lib/request-context";
import { resolveDeploymentRuntime } from "../../lib/deployment-runtime";
import { sshManager } from "../../lib/ssh-manager";
import { repos } from "@repo/db";
import * as analyticsService from "./analytics.service";
import type { TAnalyticsQuery, TUsageQuery, TUsageStreamQuery } from "./analytics.schema";

// ─── Request analytics ───────────────────────────────────────────────────────

/** GET /analytics - cumulative summary */
export async function summary(c: Context) {
  const ctx = getRequestContext(c);
  const { projectId, domain } = c.req.query() as unknown as TAnalyticsQuery;
  // Slice the single fetch+compute overview (last 24h) to just its summary.
  const data = (await analyticsService.getAnalyticsOverview(ctx, projectId, undefined, undefined, domain)).summary;
  return c.json({ data });
}

/** GET /analytics/periods - time-series periods */
export async function periods(c: Context) {
  const ctx = getRequestContext(c);
  const { projectId, from, to, domain } = c.req.query() as unknown as TAnalyticsQuery;
  // Slice the single fetch+compute overview to just its time-series periods.
  const data = (await analyticsService.getAnalyticsOverview(ctx, projectId, from, to, domain)).periods;
  return c.json({ data });
}

/**
 * GET /analytics/overview - summary + periods together, from ONE underlying
 * traffic fetch. The dashboard reads this so a project view makes a single
 * cloud round-trip instead of two (separate /summary + /periods).
 *
 * `domain` scopes the numbers to a single tracked domain (multi-domain
 * projects); omitted, it aggregates every domain like before.
 */
export async function overview(c: Context) {
  const ctx = getRequestContext(c);
  const { projectId, from, to, domain } = c.req.query() as unknown as TAnalyticsQuery;
  const data = await analyticsService.getAnalyticsOverview(ctx, projectId, from, to, domain);
  return c.json({ data });
}

// ─── Deployment stats ────────────────────────────────────────────────────────

/** GET /analytics/deployments - deployment success/fail/avg build stats */
export async function deploymentStats(c: Context) {
  const ctx = getRequestContext(c);
  const { projectId } = c.req.query() as unknown as TAnalyticsQuery;
  const data = await analyticsService.getDeploymentStats(ctx, projectId);
  return c.json({ data });
}

// ─── Resource usage ──────────────────────────────────────────────────────────

/** GET /analytics/usage - current container resource usage */
export async function usage(c: Context) {
  const ctx = getRequestContext(c);
  const { projectId } = c.req.query() as unknown as TUsageQuery;
  const data = await analyticsService.getContainerUsage(ctx, projectId);
  return c.json({ data });
}

/** GET /analytics/container - container info (status, IP, uptime) */
export async function containerInfo(c: Context) {
  const ctx = getRequestContext(c);
  const { projectId } = c.req.query() as unknown as TUsageQuery;
  const data = await analyticsService.getContainerInfo(ctx, projectId);
  return c.json({ data });
}

/** GET /analytics/usage/stream - SSE stream of real-time resource usage */
export async function usageStream(c: Context) {
  const ctx = getRequestContext(c);
  const { projectId } = c.req.query() as unknown as TUsageStreamQuery;

  // Verify project belongs to caller's active org. Membership is already
  // confirmed by the route middleware.
  const project = await repos.project.findById(projectId);
  if (!project || project.organizationId !== ctx.organizationId) {
    return c.json({ error: "Project not found" }, 404);
  }

  if (!project.activeDeploymentId) {
    return c.json({ error: "No active deployment" }, 404);
  }

  const dep = await repos.deployment.findById(project.activeDeploymentId);
  if (!dep?.containerId) {
    return c.json({ error: "No active container" }, 404);
  }

  const { runtime, serverId } = await resolveDeploymentRuntime(dep);

  return streamSSE(c, async (sseStream) => {
    if (serverId) sshManager.retain(serverId);
    const intervalMs = 5_000;
    const ac = new AbortController();
    sseStream.onAbort(() => ac.abort());

    try {
      while (!ac.signal.aborted) {
        try {
          const stats = await runtime.getUsage(dep.containerId!);
          await sseStream.writeSSE({
            event: "usage",
            data: JSON.stringify({ timestamp: new Date().toISOString(), ...stats }),
          });
        } catch {
          if (ac.signal.aborted) break;
          await sseStream.writeSSE({
            event: "error",
            data: JSON.stringify({ error: "Failed to fetch usage" }),
          });
        }
        // Abort-aware sleep - resolves immediately on disconnect
        await new Promise<void>((resolve) => {
          if (ac.signal.aborted) return resolve();
          const timer = setTimeout(resolve, intervalMs);
          ac.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
        });
      }
    } finally {
      if (serverId) sshManager.release(serverId);
    }
  });
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

/** GET /analytics/dashboard - overview stats for the active org's dashboard */
export async function dashboard(c: Context) {
  const ctx = getRequestContext(c);
  const data = await analyticsService.getDashboardStats(ctx);
  return c.json({ data });
}
