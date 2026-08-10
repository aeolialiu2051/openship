import { isIP } from "node:net";
import { resolve4 } from "node:dns/promises";
import { CloudflareRouterInfra } from "@repo/adapters";
import { originHostnameForServer } from "@repo/core/managed-routing";
import type { Server } from "@repo/db";
import { env } from "../config/env";
import { isNonPublicHost } from "./edge-target";

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
  await infra.provisionServerOrigin({ routingId: server.routingId, ipv4: await publicIpv4(server.sshHost) });
  return originHostnameForServer(server.routingId, env.VIBRAIL_MANAGED_DOMAIN);
}

export async function removeServerOrigin(server: Server): Promise<void> {
  const infra = serverRouterInfra();
  if (infra && server.routingId) await infra.removeServerOrigin(server.routingId);
}
