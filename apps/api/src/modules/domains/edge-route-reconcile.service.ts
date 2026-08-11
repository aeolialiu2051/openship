import { repos, type Domain } from "@repo/db";
import type { EdgeRouteStore } from "@repo/adapters";
import { parseEdgeRoute } from "@repo/core/managed-routing";
import { edgeRouteStore } from "../../lib/edge-route-projection";
import { installServerAuthorityRoute, removeServerAuthorityRoute } from "../../lib/server-route-authority";

export type RouteReconcileResult = "unchanged" | "published" | "disabled" | "ahead";

/** Reconcile one DB-authoritative domain projection. A higher unknown edge
 * version is never overwritten: callers must alert/audit it. */
export async function reconcileDomainProjection(
  domain: Domain,
  serverRoutingId: string,
  store: EdgeRouteStore,
  hooks: { ensureAuthority?: () => Promise<void>; removeAuthority?: () => Promise<void> } = {},
): Promise<RouteReconcileResult> {
  if (domain.domainType !== "free" || !domain.projectId) return "unchanged";
  const current = await store.get(domain.hostname);
  if (current && current.version > domain.routeVersion) return "ahead";

  if (["disabled", "deleting"].includes(domain.routeStatus)) {
    await hooks.removeAuthority?.();
    if (current && !current.enabled && current.version === domain.routeVersion) return "unchanged";
    await store.disable(domain.hostname, domain.routeVersion);
    return "disabled";
  }

  const expected = parseEdgeRoute({
    project_id: domain.projectId,
    service_id: domain.serviceId,
    server_id: serverRoutingId,
    enabled: true,
    version: domain.routeVersion,
    updated_at: domain.updatedAt.toISOString(),
  });
  // Only touch server authority after rejecting an unknown higher edge
  // version. This repairs a missing/stale file even when KV itself is already
  // correct, without downgrading authority during an audit alert.
  await hooks.ensureAuthority?.();
  if (current && current.enabled && current.version === expected.version && current.server_id === expected.server_id && current.project_id === expected.project_id && current.service_id === expected.service_id) return "unchanged";
  await store.publish(domain.hostname, expected);
  return "published";
}

export interface EdgeRouteSweepSummary {
  scanned: number;
  published: number;
  disabled: number;
  unchanged: number;
  ahead: number;
  skipped: number;
  failed: number;
}

/** Bounded, paginated reconciliation sweep. Each row is isolated so one bad
 * server/deployment backs off until the next scheduled run without blocking
 * healthy projections. */
export async function runEdgeRouteReconcileSweep(options: { limit?: number; offset?: number } = {}): Promise<EdgeRouteSweepSummary> {
  const summary: EdgeRouteSweepSummary = { scanned: 0, published: 0, disabled: 0, unchanged: 0, ahead: 0, skipped: 0, failed: 0 };
  const store = edgeRouteStore();
  if (!store) return summary;
  const rows = await repos.domain.listManagedForReconcile(options.limit ?? 100, options.offset ?? 0);
  const projectCache = new Map<string, Awaited<ReturnType<typeof repos.project.findById>>>();
  const deploymentCache = new Map<string, Awaited<ReturnType<typeof repos.deployment.findById>>>();
  const serverCache = new Map<string, Awaited<ReturnType<typeof repos.server.get>>>();

  for (const domain of rows) {
    summary.scanned += 1;
    try {
      if (!domain.projectId) { summary.skipped += 1; continue; }
      // Disabling the edge projection does not depend on a live deployment.
      // Do this before placement lookup so a removed/broken deployment can
      // never leave an active public KV route behind indefinitely.
      if (["disabled", "deleting"].includes(domain.routeStatus)) {
        const result = await reconcileDomainProjection(domain, "disabled", store);
        summary[result] += 1;
        if (result === "ahead") {
          console.error(JSON.stringify({ event: "edge_route_version_ahead", domain_id: domain.id, hostname: domain.hostname, database_version: domain.routeVersion }));
        } else {
          await repos.domain.markRouteReconciled(domain.id);
        }
        continue;
      }
      if (!projectCache.has(domain.projectId)) projectCache.set(domain.projectId, await repos.project.findById(domain.projectId));
      const project = projectCache.get(domain.projectId);
      if (!project?.activeDeploymentId) { summary.skipped += 1; continue; }
      if (!deploymentCache.has(project.activeDeploymentId)) deploymentCache.set(project.activeDeploymentId, await repos.deployment.findById(project.activeDeploymentId));
      const deployment = deploymentCache.get(project.activeDeploymentId);
      const serverId = (deployment?.meta as { serverId?: string } | null)?.serverId;
      if (!serverId) { summary.skipped += 1; continue; }
      if (!serverCache.has(serverId)) serverCache.set(serverId, await repos.server.get(serverId));
      const server = serverCache.get(serverId);
      if (!server?.routingId) { summary.skipped += 1; continue; }
      const result = await reconcileDomainProjection(domain, server.routingId, store, {
        ensureAuthority: () => installServerAuthorityRoute(serverId, domain, domain.routeVersion),
        removeAuthority: () => removeServerAuthorityRoute(serverId, domain.hostname),
      });
      summary[result] += 1;
      if (result === "ahead") {
        console.error(JSON.stringify({ event: "edge_route_version_ahead", domain_id: domain.id, hostname: domain.hostname, database_version: domain.routeVersion }));
      } else {
        await repos.domain.markRouteReconciled(domain.id);
      }
    } catch (error) {
      summary.failed += 1;
      console.warn(JSON.stringify({ event: "edge_route_reconcile_failed", domain_id: domain.id, hostname: domain.hostname, error: error instanceof Error ? error.message : "unknown" }));
    }
  }
  console.info(JSON.stringify({ event: "edge_route_reconcile_complete", ...summary }));
  return summary;
}
