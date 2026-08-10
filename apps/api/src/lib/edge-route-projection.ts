import { CloudflareKvEdgeRouteStore, type EdgeRouteStore } from "@repo/adapters";
import { repos, type Domain } from "@repo/db";
import { parseEdgeRoute } from "@repo/core/managed-routing";
import { env } from "../config/env";
import { installServerAuthorityRoute, removeServerAuthorityRoute } from "./server-route-authority";
import { waitForManagedRoutePropagation } from "./edge-route-readiness";

export { waitForManagedRoutePropagation } from "./edge-route-readiness";

let singleton: EdgeRouteStore | null | undefined;

export function edgeRouteStore(): EdgeRouteStore | null {
  if (singleton !== undefined) return singleton;
  const accountId = env.VIBRAIL_CLOUDFLARE_ACCOUNT_ID;
  const namespaceId = env.VIBRAIL_ROUTING_KV_NAMESPACE_ID;
  const apiToken = env.VIBRAIL_ROUTING_KV_API_TOKEN;
  singleton = accountId && namespaceId && apiToken
    ? new CloudflareKvEdgeRouteStore({ accountId, namespaceId, apiToken })
    : null;
  return singleton;
}

export function setEdgeRouteStoreForTest(store: EdgeRouteStore | null | undefined): void { singleton = store; }

export async function publishManagedDomainRoute(domain: Domain, serverId: string): Promise<void> {
  if (domain.domainType !== "free") return;
  const store = edgeRouteStore();
  if (!store) throw new Error("Cloudflare routing KV is not configured");
  const server = await repos.server.get(serverId);
  if (!server?.routingId) throw new Error(`Server ${serverId} has no edge routing ID`);
  const route = parseEdgeRoute({
    project_id: domain.projectId,
    service_id: domain.serviceId,
    server_id: server.routingId,
    enabled: true,
    version: domain.routeVersion,
    updated_at: new Date().toISOString(),
  });
  // Gateway authority must be ready before the edge can emit traffic.
  await installServerAuthorityRoute(serverId, domain);
  await store.publish(domain.hostname, route);
  if (!(await waitForManagedRoutePropagation(domain.hostname, domain.routeVersion))) {
    throw new Error(`Edge route ${domain.hostname} version ${domain.routeVersion} did not propagate before the readiness deadline`);
  }
  await repos.domain.updateRouteState(domain.id, domain.routeVersion, "active");
}

export async function disableManagedDomainRoute(domain: Domain): Promise<void> {
  const store = edgeRouteStore();
  if (!store || domain.domainType !== "free") return;
  const version = await repos.domain.nextRouteVersion(domain.id);
  if (domain.projectId) {
    const project = await repos.project.findById(domain.projectId);
    const deployment = project?.activeDeploymentId ? await repos.deployment.findById(project.activeDeploymentId) : null;
    const serverId = (deployment?.meta as { serverId?: string } | null)?.serverId;
    if (serverId) await removeServerAuthorityRoute(serverId, domain.hostname);
  }
  await store.disable(domain.hostname, version);
  await repos.domain.updateRouteState(domain.id, version, "disabled");
}

export async function removeManagedDomainRoute(domain: Domain): Promise<void> {
  const store = edgeRouteStore();
  if (!store || domain.domainType !== "free") return;
  const version = await repos.domain.nextRouteVersion(domain.id);
  await repos.domain.updateRouteState(domain.id, version, "deleting");
  await store.remove(domain.hostname, version);
}
