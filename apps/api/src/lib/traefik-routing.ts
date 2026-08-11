import { repos } from "@repo/db";
import type {
  ResolvedTraefikEdge,
  TraefikEdgeConfig,
  TraefikManualConfig,
  TraefikRouteConfig,
} from "@repo/adapters";
import { DockerRuntime } from "@repo/adapters";
import { originHostnameForServer } from "@repo/core/managed-routing";
import { compileProjectTraefikRules } from "../modules/route-rules/route-rule.service";
import { ensureServerOriginSecret } from "./server-origin-infra";
export { vibrailRouterName } from "./traefik-router-name";

function serverRateLimitRuleName(serverId: string, projectId: string): string {
  return `vibrail-server-${serverId}-${projectId}-rate`
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .toLowerCase()
    .slice(0, 63)
    .replace(/-+$/g, "");
}

/** Compile the server ceiling into one host-wide middleware per public route. */
export function compileServerTraefikRateLimit(
  serverId: string,
  projectId: string,
  rps: number,
  burst: number,
  routes: TraefikRouteConfig[],
): Record<string, import("@repo/adapters").TraefikRouteRuleConfig[]> {
  if (rps <= 0) return {};
  const result: Record<string, import("@repo/adapters").TraefikRouteRuleConfig[]> = {};
  for (const route of routes) {
    const hostname = route.hostname.trim().toLowerCase();
    if (!hostname || result[hostname]) continue;
    result[hostname] = [
      {
        // Traefik's Docker-provider middleware namespace is server-wide. Keep
        // the name project-specific so two deployed containers never define
        // the same middleware object from different Docker providers.
        name: serverRateLimitRuleName(serverId, projectId),
        rateLimit: { average: Math.max(1, Math.floor(rps)), burst: Math.max(0, Math.floor(burst)) },
      },
    ];
  }
  return result;
}

export async function resolveTraefikManualConfig(
  organizationId: string,
  serverId?: string,
): Promise<TraefikManualConfig> {
  const server = serverId
    ? await repos.server.getInOrganization(serverId, organizationId).catch(() => null)
    : null;
  return {
    network: server?.traefikNetwork ?? undefined,
    entrypoint: server?.traefikEntrypoint ?? undefined,
    tls: server?.traefikTls ?? undefined,
    certResolver: server?.traefikCertResolver ?? undefined,
  };
}

export async function prepareTraefikConfig(opts: {
  runtime: DockerRuntime;
  organizationId: string;
  serverId?: string;
  projectId: string;
  routes: TraefikRouteConfig[];
  onLog?: (message: string) => void;
}): Promise<TraefikEdgeConfig> {
  const [manual, projectRouteRules, server] = await Promise.all([
    resolveTraefikManualConfig(opts.organizationId, opts.serverId),
    compileProjectTraefikRules(opts.projectId),
    opts.serverId
      ? repos.server.getInOrganization(opts.serverId, opts.organizationId).catch(() => null)
      : Promise.resolve(null),
  ]);
  // Install/repair the derived per-server secret before a versioned edge
  // replacement starts. The Traefik auth plugin fails closed without it.
  if (server) await ensureServerOriginSecret(server);
  const edge: ResolvedTraefikEdge = await opts.runtime.ensureSharedTraefik(manual);
  opts.onLog?.(
    edge.source === "existing"
      ? `Reusing existing Traefik on network "${edge.network}" (entrypoint "${edge.entrypoint}").\n`
      : `Shared Traefik "vibrail-edge" is ready on network "${edge.network}".\n`,
  );
  const serverRouteRules = server
    ? compileServerTraefikRateLimit(
        server.id,
        opts.projectId,
        server.traefikRateLimitRps,
        server.traefikRateLimitBurst,
        opts.routes,
      )
    : {};
  const routeRules = { ...serverRouteRules };
  for (const [hostname, rules] of Object.entries(projectRouteRules)) {
    routeRules[hostname] = [...(routeRules[hostname] ?? []), ...rules];
  }

  return {
    network: edge.network,
    entrypoint: edge.entrypoint,
    ...(server?.routingId
      ? {
          managedOriginHost: originHostnameForServer(
            server.routingId,
            process.env.VIBRAIL_MANAGED_DOMAIN ?? "vibrail.app",
          ),
        }
      : {}),
    tls: edge.tls,
    ...(edge.certResolver ? { certResolver: edge.certResolver } : {}),
    routes: opts.routes,
    ...(Object.keys(routeRules).length > 0 ? { routeRules } : {}),
  };
}
