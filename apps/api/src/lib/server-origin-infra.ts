import { isIP } from "node:net";
import { resolve4 } from "node:dns/promises";
import { createHmac } from "node:crypto";
import { CloudflareRouterInfra, elevatedExecutor, resolveEnvironment } from "@repo/adapters";
import { originHostnameForServer } from "@repo/core/managed-routing";
import type { Server } from "@repo/db";
import { env } from "../config/env";
import { isNonPublicHost } from "./edge-target";
import { createServerCommandExecutor } from "./deployment-runtime";

const EDGE_SECRET_DIR = "/etc/vibrail/edge";
const EDGE_SECRET_PATH = `${EDGE_SECRET_DIR}/server-secret`;
const EDGE_PREVIOUS_SECRET_PATH = `${EDGE_SECRET_DIR}/previous-server-secret`;
const EDGE_NEXT_SECRET_PATH = `${EDGE_SECRET_DIR}/.server-secret.next`;

export function deriveServerOriginSecret(masterSecret: string, routingId: string): string {
  return createHmac("sha256", masterSecret).update(`v1:${routingId}`).digest("hex");
}

export async function ensureServerOriginSecret(server: Server): Promise<void> {
  if (!env.VIBRAIL_ROUTING_KV_NAMESPACE_ID) return;
  if (!server.routingId || !server.organizationId) throw new Error("Server routing identity is missing");
  if (!env.VIBRAIL_ROUTER_MASTER_SECRET) throw new Error("VIBRAIL_ROUTER_MASTER_SECRET is not configured");
  const { executor } = await createServerCommandExecutor(server.id, server.organizationId);
  const profile = await resolveEnvironment(executor);
  if (!profile.isRoot && !profile.canSudo) {
    throw new Error("Installing managed-origin authentication requires root or passwordless sudo");
  }
  const privileged = profile.isRoot ? executor : elevatedExecutor(executor);
  await privileged.mkdir(EDGE_SECRET_DIR);
  await privileged.writeFile(
    EDGE_NEXT_SECRET_PATH,
    `${deriveServerOriginSecret(env.VIBRAIL_ROUTER_MASTER_SECRET, server.routingId)}\n`,
  );
  await privileged.exec(
    `chmod 600 ${EDGE_NEXT_SECRET_PATH}; ` +
      `if [ -f ${EDGE_SECRET_PATH} ] && ! cmp -s ${EDGE_SECRET_PATH} ${EDGE_NEXT_SECRET_PATH}; then ` +
      `cp -f ${EDGE_SECRET_PATH} ${EDGE_PREVIOUS_SECRET_PATH}; chmod 600 ${EDGE_PREVIOUS_SECRET_PATH}; fi; ` +
      `mv -f ${EDGE_NEXT_SECRET_PATH} ${EDGE_SECRET_PATH}`,
  );
}

export function serverRouterInfra(): CloudflareRouterInfra | null {
  if (!env.VIBRAIL_ROUTING_KV_NAMESPACE_ID) return null;
  if (!env.VIBRAIL_CLOUDFLARE_ZONE_ID || !env.VIBRAIL_CLOUDFLARE_API_TOKEN) throw new Error("Edge routing requires Cloudflare zone credentials");
  return new CloudflareRouterInfra({ zoneId: env.VIBRAIL_CLOUDFLARE_ZONE_ID, apiToken: env.VIBRAIL_CLOUDFLARE_API_TOKEN, baseDomain: env.VIBRAIL_MANAGED_DOMAIN });
}

async function publicIpv4(host: string): Promise<string> {
  const candidates = isIP(host) === 4 ? [host] : await resolve4(host);
  const address = candidates.find((value) => !isNonPublicHost(value));
  if (!address) throw new Error(`No public IPv4 address could be resolved for ${host}`);
  return address;
}

export async function provisionServerOrigin(server: Server): Promise<string | null> {
  const infra = serverRouterInfra();
  if (!infra) return null;
  if (!server.routingId) throw new Error("Server routing ID is missing");
  await ensureServerOriginSecret(server);
  await infra.provisionServerOrigin({ routingId: server.routingId, ipv4: await publicIpv4(server.sshHost) });
  return originHostnameForServer(server.routingId, env.VIBRAIL_MANAGED_DOMAIN);
}

export async function removeServerOrigin(server: Server): Promise<void> {
  const infra = serverRouterInfra();
  if (infra && server.routingId) await infra.removeServerOrigin(server.routingId);
}
