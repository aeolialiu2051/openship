import { repos } from "@repo/db";
import type {
  ResolvedTraefikEdge,
  TraefikEdgeConfig,
  TraefikManualConfig,
  TraefikRouteConfig,
} from "@repo/adapters";
import { DockerRuntime } from "@repo/adapters";
import { compileProjectTraefikRules } from "../modules/route-rules/route-rule.service";
export { vibrailRouterName } from "./traefik-router-name";

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
  const [manual, routeRules] = await Promise.all([
    resolveTraefikManualConfig(opts.organizationId, opts.serverId),
    compileProjectTraefikRules(opts.projectId),
  ]);
  const edge: ResolvedTraefikEdge = await opts.runtime.ensureSharedTraefik(manual);
  opts.onLog?.(
    edge.source === "existing"
      ? `Reusing existing Traefik on network "${edge.network}" (entrypoint "${edge.entrypoint}").\n`
      : `Shared Traefik "vibrail-edge" is ready on network "${edge.network}".\n`,
  );
  return {
    network: edge.network,
    entrypoint: edge.entrypoint,
    tls: edge.tls,
    ...(edge.certResolver ? { certResolver: edge.certResolver } : {}),
    routes: opts.routes,
    ...(Object.keys(routeRules).length > 0 ? { routeRules } : {}),
  };
}
