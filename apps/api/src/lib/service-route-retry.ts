import { repos, type Deployment, type Domain, type Project, type Service } from "@repo/db";
import type { Platform, RuntimeAdapter } from "@repo/adapters";
import { buildServiceRouteDomains } from "./routing-domains";
import { syncServiceRouteDns } from "./service-route-dns";
import { waitForDeploymentDnsPropagation } from "./cloudflare-dns";
import { buildUpstreamUrl, resolveRouteStrategy } from "./upstream-url";
import { reconcileProjectRoutes, type RouteRegister } from "./route-apply.service";
import { inheritSoleProjectRouteForService } from "./public-endpoints";

export interface ServiceRouteRetryFailure {
  hostname: string;
  message: string;
}

/**
 * Retry the complete service routing chain without rebuilding containers:
 * persist an unambiguous legacy project→service route, upsert DNS, wait for
 * public resolution, resolve the live service upstream, then register Traefik.
 * A successful return therefore means it is safe to clear Action Required.
 */
export async function retryProjectServiceRoutes(opts: {
  project: Project;
  deployment: Deployment;
  runtime: RuntimeAdapter;
  routing: Platform["routing"];
  usesManagedRouting: boolean;
  serverId?: string;
}): Promise<{ failures: ServiceRouteRetryFailure[] }> {
  if (!opts.usesManagedRouting) return { failures: [] };

  let services = await repos.service.listByProject(opts.project.id);
  const domains = await repos.domain.listByProject(opts.project.id);
  const inherited = inheritSoleProjectRouteForService(services, domains);
  if (inherited) {
    const endpoint = inherited.endpoint;
    const patch = {
      exposed: true,
      exposedPort: String(endpoint.port),
      domain: endpoint.domainType === "free" ? (endpoint.domain ?? null) : null,
      customDomain: endpoint.domainType === "custom" ? (endpoint.customDomain ?? null) : null,
      domainType: endpoint.domainType,
      publicEndpoints: [endpoint],
    };
    await repos.service.update(inherited.serviceId, patch);
    services = services.map((service) =>
      service.id === inherited.serviceId ? ({ ...service, ...patch } as Service) : service,
    );
  }

  const domainByHostname = new Map<string, Domain>(
    domains.map((domain) => [domain.hostname.toLowerCase(), domain]),
  );
  const liveRows = await repos.service.listByDeployment(opts.deployment.id);
  const liveByService = new Map(liveRows.map((row) => [row.serviceId, row]));
  const strategy = resolveRouteStrategy(opts.project.routeStrategy);
  const failures: ServiceRouteRetryFailure[] = [];
  const registers: RouteRegister[] = [];

  for (const service of services.filter((candidate) => candidate.enabled && candidate.exposed)) {
    const routes = buildServiceRouteDomains({
      project: opts.project,
      service,
      runtimeName: opts.runtime.name,
      usesManagedRouting: true,
      domainByHostname,
    });
    if (routes.length === 0) continue;

    const dns = await syncServiceRouteDns({
      projectId: opts.project.id,
      organizationId: opts.project.organizationId,
      serverId: opts.serverId,
      nextRoutes: routes,
      removedRoutes: [],
      domainByHostname,
    });
    failures.push(
      ...dns.failures.map((failure) => ({
        hostname: failure.hostname,
        message: `${failure.operation} DNS failed: ${failure.message}`,
      })),
    );

    const live = liveByService.get(service.id);
    for (const route of dns.publishableRoutes) {
      if (!(await waitForDeploymentDnsPropagation(route.hostname))) {
        failures.push({
          hostname: route.hostname,
          message: "DNS is still not publicly resolvable",
        });
        continue;
      }
      if (route.targetPort === undefined) continue;
      const targetUrl = buildUpstreamUrl({
        strategy,
        ip: live?.ip,
        hostPort: live?.hostPort,
        containerPort: route.targetPort,
      });
      if (!targetUrl) {
        failures.push({
          hostname: route.hostname,
          message: `no live upstream found for service ${service.name} on port ${route.targetPort}`,
        });
        continue;
      }
      registers.push({
        hostname: route.hostname,
        targetUrl,
        port: route.targetPort,
        isCustomDomain: route.domainType === "custom",
      });
    }
  }

  if (registers.length > 0) {
    try {
      await reconcileProjectRoutes(opts.project, {
        deployment: opts.deployment,
        routing: opts.routing,
        registers,
        strict: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown live proxy error";
      for (const register of registers) failures.push({ hostname: register.hostname, message });
    }
  }

  return { failures };
}
