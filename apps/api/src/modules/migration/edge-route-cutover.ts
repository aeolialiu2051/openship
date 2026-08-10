import { repos, type Domain } from "@repo/db";
import type { EdgeRouteStore } from "@repo/adapters";
import { parseEdgeRoute } from "@repo/core/managed-routing";

export type EdgeCutoverResult = { switched: Array<{ domainId: string; hostname: string; version: number }>; rolledBack: boolean };

/** Versioned cross-server cutover. Call only after the target workload and
 * Gateway are healthy, while source workload/routes are still retained. */
export async function cutoverManagedRoutes(input: {
  domains: Domain[];
  sourceRoutingId: string;
  targetRoutingId: string;
  store: EdgeRouteStore;
  beforeTargetPublish?: (domain: Domain, version: number) => Promise<void>;
  beforeSourceRollback?: (domain: Domain, version: number) => Promise<void>;
  afterRollbackRetention?: (domain: Domain) => Promise<void>;
  rollbackRetentionMs?: number;
}): Promise<EdgeCutoverResult> {
  const switched: EdgeCutoverResult["switched"] = [];
  try {
    for (const domain of input.domains.filter((row) => row.domainType === "free" && row.projectId)) {
      const version = await repos.domain.nextRouteVersion(domain.id);
      await input.beforeTargetPublish?.(domain, version);
      await input.store.publish(domain.hostname, parseEdgeRoute({ project_id: domain.projectId, service_id: domain.serviceId, server_id: input.targetRoutingId, enabled: true, version, updated_at: new Date().toISOString() }));
      await repos.domain.updateRouteState(domain.id, version, "active");
      switched.push({ domainId: domain.id, hostname: domain.hostname, version });
    }
    return { switched, rolledBack: false };
  } catch (error) {
    // Rollback is itself forward-only: use a newer DB/KV version pointing at
    // source so delayed target writes can never overwrite it.
    for (const item of [...switched].reverse()) {
      const domain = await repos.domain.findById(item.domainId);
      if (!domain?.projectId) continue;
      const version = await repos.domain.nextRouteVersion(domain.id);
      await input.beforeSourceRollback?.(domain, version);
      await input.store.publish(domain.hostname, parseEdgeRoute({ project_id: domain.projectId, service_id: domain.serviceId, server_id: input.sourceRoutingId, enabled: true, version, updated_at: new Date().toISOString() }));
      await repos.domain.updateRouteState(domain.id, version, "active");
    }
    // Cached target projections may remain live after the forward-only source
    // rollback. Keep target authority until that cache window has elapsed,
    // then remove every target manifest installed by this attempt (including
    // the route whose KV write failed).
    if (input.afterRollbackRetention) {
      const retentionMs = input.rollbackRetentionMs ?? 0;
      if (retentionMs > 0) await new Promise((resolve) => setTimeout(resolve, retentionMs));
      for (const domain of input.domains.filter((row) => row.domainType === "free" && row.projectId)) {
        await input.afterRollbackRetention(domain);
      }
    }
    throw error;
  }
}
