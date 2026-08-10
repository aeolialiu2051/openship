import { elevatedExecutor } from "@repo/adapters";
import { repos, type Domain } from "@repo/db";
import { createServerCommandExecutor } from "./deployment-runtime";

const ROUTE_DIR = "/etc/vibrail/edge-routes";

export async function installServerAuthorityRoute(serverId: string, domain: Domain, version = domain.routeVersion): Promise<void> {
  if (!domain.projectId || domain.domainType !== "free") return;
  const server = await repos.server.get(serverId);
  if (!server?.organizationId || !server.routingId) throw new Error(`Server ${serverId} cannot host an edge authority route`);
  const { executor } = await createServerCommandExecutor(serverId, server.organizationId);
  const elevated = elevatedExecutor(executor);
  await elevated.mkdir(ROUTE_DIR);
  await elevated.writeFile(`${ROUTE_DIR}/${domain.hostname.toLowerCase()}.json`, `${JSON.stringify({ hostname: domain.hostname.toLowerCase(), project_id: domain.projectId, service_id: domain.serviceId, server_id: server.routingId, version, enabled: true })}\n`);
}

export async function removeServerAuthorityRoute(serverId: string, hostname: string): Promise<void> {
  const server = await repos.server.get(serverId);
  if (!server?.organizationId) return;
  const { executor } = await createServerCommandExecutor(serverId, server.organizationId);
  await elevatedExecutor(executor).rm(`${ROUTE_DIR}/${hostname.toLowerCase()}.json`);
}
