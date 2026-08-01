import { repos, type Deployment, type Domain, type Project, type Service } from "@repo/db";
import type { Platform, RuntimeAdapter } from "@repo/adapters";
import { buildServiceRouteDomains } from "./routing-domains";
import { syncServiceRouteDns } from "./service-route-dns";
import { waitForDeploymentDnsPropagation } from "./cloudflare-dns";
import { buildUpstreamUrl, resolveRouteStrategy } from "./upstream-url";
import { reconcileProjectRoutes, type RouteRegister } from "./route-apply.service";
import { inheritSoleProjectRouteForService } from "./public-endpoints";

const ROUTING_RETRY_DNS_ATTEMPTS = 60;

export interface ServiceRouteRetryFailure {
  hostname: string;
  message: string;
}

/**
 * Retry the complete service routing chain without rebuilding images: persist
 * an unambiguous legacy project→service route, upsert DNS, wait for public
 * resolution, then publish Traefik. Docker routes live in immutable container
 * labels, so affected Docker service containers are recreated from their
 * existing images; other runtimes use their live routing provider.
 */
export async function retryProjectServiceRoutes(opts: {
  project: Project;
  deployment: Deployment;
  runtime: RuntimeAdapter;
  routing: Platform["routing"];
  usesManagedRouting: boolean;
  serverId?: string;
  /** Docker publishes Traefik routes through immutable container labels. A
   *  repair must therefore recreate only the affected service containers from
   *  their existing images; registerRoute is intentionally a no-op there. */
  recreateDockerServices?: (serviceIds: string[]) => Promise<void>;
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
  const dockerRoutes: Array<{ serviceId: string; hostname: string }> = [];
  const pendingRoutes: Array<{
    service: Service;
    route: ReturnType<typeof buildServiceRouteDomains>[number];
    live: (typeof liveRows)[number] | undefined;
  }> = [];

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

    for (const route of dns.publishableRoutes) {
      pendingRoutes.push({ service, route, live: liveByService.get(service.id) });
    }
  }

  // One route may need the full propagation window. Waiting serially made the
  // repair request scale as 30s × domain count and caused the dashboard/proxy
  // request to abort. Probe every published hostname concurrently instead.
  const propagatedRoutes = await Promise.all(
    pendingRoutes.map(async (pending) => ({
      ...pending,
      // Allow a full minute so temporary resolver/NXDOMAIN caches do not make
      // the manual repair fail before the public record becomes visible.
      propagated: await waitForDeploymentDnsPropagation(pending.route.hostname, {
        attempts: ROUTING_RETRY_DNS_ATTEMPTS,
        intervalMs: 1_000,
      }),
    })),
  );

  for (const { service, route, live, propagated } of propagatedRoutes) {
    if (!propagated) {
      failures.push({
        hostname: route.hostname,
        message: "DNS is still not publicly resolvable",
      });
      continue;
    }
    if (route.targetPort === undefined) continue;
    if (opts.runtime.name === "docker") {
      dockerRoutes.push({ serviceId: service.id, hostname: route.hostname });
      continue;
    }
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

  if (dockerRoutes.length > 0) {
    if (!opts.recreateDockerServices) {
      for (const route of dockerRoutes) {
        failures.push({
          hostname: route.hostname,
          message: "Docker route repair could not refresh the container labels",
        });
      }
    } else {
      try {
        await opts.recreateDockerServices([
          ...new Set(dockerRoutes.map((route) => route.serviceId)),
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown Docker route repair error";
        for (const route of dockerRoutes) failures.push({ hostname: route.hostname, message });
      }
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
