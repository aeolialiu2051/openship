import { repos, type Deployment, type Project } from "@repo/db";
import type { DockerRuntime, RuntimeAdapter } from "@repo/adapters";
import { decryptEnvMap } from "./encryption";
import { withDefaults } from "./resources";
import {
  buildProjectRouteDomains,
  getRoutingBaseDomain,
  isRoutePublishable,
} from "./routing-domains";
import { syncServiceRouteDns } from "./service-route-dns";
import { waitForDeploymentDnsPropagation } from "./cloudflare-dns";
import { prepareTraefikConfig, vibrailRouterName } from "./traefik-routing";
import { resolveTraefikRoutePort } from "../modules/deployments/build-execution-plan";
import { resolveProjectRouteState } from "../modules/domains/project-route.service";
import { managedWebmailBindMounts } from "../modules/mail/webmail/webmail-persistence";
import { attachLinkedNetworks } from "../modules/deployments/attach-linked-networks";
import type { DeploymentConfigSnapshot } from "../modules/deployments/build.service";

const ROUTING_REPAIR_DNS_ATTEMPTS = 60;
const ROUTING_REPAIR_DNS_DEADLINE_MS = 60_000;

export interface ProjectRouteRetryFailure {
  hostname: string;
  message: string;
}

/** Repair project-level routes used by single-app deployments. Service routes
 * are handled separately by service-route-retry. Docker route labels are
 * immutable, so a successful repair starts a replacement from the already-built
 * image, then removes the old container; it never rebuilds application code. */
export async function retryProjectApplicationRoutes(opts: {
  project: Project;
  deployment: Deployment;
  runtime: RuntimeAdapter;
  usesManagedRouting: boolean;
  serverId?: string;
}): Promise<{ failures: ProjectRouteRetryFailure[]; attemptedRoutes: number }> {
  if (!opts.usesManagedRouting) return { failures: [], attemptedRoutes: 0 };

  const routeState = await resolveProjectRouteState(opts.project);
  const domainByHostname = new Map(
    routeState.projectDomains.map((domain) => [domain.hostname.toLowerCase(), domain]),
  );
  const snapshot = (opts.deployment.meta ?? {}) as DeploymentConfigSnapshot;
  const plannedRoutes = buildProjectRouteDomains({
    project: opts.project,
    projectDomains: routeState.projectDomains,
    managedSlug: routeState.publicEndpoints.length > 0 ? routeState.primarySlug : undefined,
    publicEndpoints: routeState.publicEndpoints,
    runtimeName: opts.runtime.name,
    usesManagedRouting: true,
  }).filter(isRoutePublishable);
  const attemptedRoutes = plannedRoutes.length;
  if (attemptedRoutes === 0) return { failures: [], attemptedRoutes };

  const dns = await syncServiceRouteDns({
    projectId: opts.project.id,
    organizationId: opts.project.organizationId,
    serverId: opts.serverId,
    nextRoutes: plannedRoutes,
    removedRoutes: [],
    domainByHostname,
  });
  const failures: ProjectRouteRetryFailure[] = dns.failures.map((failure) => ({
    hostname: failure.hostname,
    message: `${failure.operation} DNS failed: ${failure.message}`,
  }));

  const propagated = await Promise.all(
    dns.publishableRoutes.map(async (route) => ({
      route,
      ready: await waitForDeploymentDnsPropagation(route.hostname, {
        attempts: ROUTING_REPAIR_DNS_ATTEMPTS,
        intervalMs: 1_000,
        deadlineMs: ROUTING_REPAIR_DNS_DEADLINE_MS,
      }),
    })),
  );
  const readyRoutes = propagated.filter(({ ready }) => ready).map(({ route }) => route);
  for (const { route, ready } of propagated) {
    if (!ready) {
      failures.push({ hostname: route.hostname, message: "DNS is still not publicly resolvable" });
    }
  }
  if (readyRoutes.length === 0) return { failures, attemptedRoutes };

  if (opts.runtime.name !== "docker") {
    for (const route of readyRoutes) {
      failures.push({
        hostname: route.hostname,
        message: `single-app route repair is not supported by runtime ${opts.runtime.name}`,
      });
    }
    return { failures, attemptedRoutes };
  }
  if (!opts.deployment.imageRef || !opts.deployment.containerId) {
    for (const route of readyRoutes) {
      failures.push({
        hostname: route.hostname,
        message: "the active deployment has no reusable image or container",
      });
    }
    return { failures, attemptedRoutes };
  }

  const isStaticContainer = snapshot.hasServer === false;
  const traefikRoutes = readyRoutes
    .map((route) => ({
      ...route,
      effectivePort: resolveTraefikRoutePort({
        targetPort: route.targetPort,
        targetPath: route.targetPath,
        isStaticContainer,
        runtimePort: snapshot.port,
      }),
    }))
    .filter(
      (route): route is typeof route & { effectivePort: number } =>
        route.effectivePort !== undefined,
    )
    .map((route) => ({
      routerName: vibrailRouterName(
        opts.project.routeKey ?? opts.project.id,
        String(route.effectivePort),
        route.hostname,
      ),
      hostname: route.hostname,
      port: route.effectivePort,
      tls: route.tls,
      ...(route.targetPath ? { targetPath: route.targetPath } : {}),
    }));
  if (traefikRoutes.length === 0) {
    for (const route of readyRoutes) {
      failures.push({ hostname: route.hostname, message: "the route has no usable target port" });
    }
    return { failures, attemptedRoutes };
  }

  const dockerRuntime = opts.runtime as DockerRuntime;
  const failedEnvKeys: string[] = [];
  const envVars = decryptEnvMap((opts.deployment.envVars ?? {}) as Record<string, string>, (key) =>
    failedEnvKeys.push(key),
  );
  if (failedEnvKeys.length > 0) {
    const message = `environment variables could not be decrypted: ${failedEnvKeys.join(", ")}`;
    for (const route of readyRoutes) failures.push({ hostname: route.hostname, message });
    return { failures, attemptedRoutes };
  }

  let replacementContainerId: string | undefined;
  try {
    const traefik = await prepareTraefikConfig({
      runtime: dockerRuntime,
      organizationId: opts.deployment.organizationId,
      serverId: opts.serverId,
      projectId: opts.project.id,
      routes: traefikRoutes,
    });
    const replacement = await dockerRuntime.deploy({
      // Keep the real deployment id in labels while varying runtimeName so the
      // replacement can start beside the old container. If creation fails, the
      // still-running old workload remains untouched.
      deploymentId: opts.deployment.id,
      projectId: opts.project.id,
      buildSessionId: opts.deployment.id,
      imageRef: opts.deployment.imageRef,
      environment: opts.deployment.environment,
      port: snapshot.port,
      startCommand: snapshot.startCommand,
      stack: snapshot.framework,
      envVars,
      resources: withDefaults(snapshot.resources),
      restartPolicy: "always",
      runtimeName: `${opts.project.slug ?? opts.project.id}-routing-repair-${Date.now().toString(36)}`,
      managedDomain: getRoutingBaseDomain(),
      publicEndpoints: routeState.publicEndpoints,
      traefik,
      bindMounts: managedWebmailBindMounts({
        isApp: opts.project.isApp,
        appTemplateId: opts.project.appTemplateId,
        framework: snapshot.framework,
        isSelfHostedDocker: true,
      }),
      outputDirectory: snapshot.outputDirectory,
      productionPaths: snapshot.productionPaths?.length ? snapshot.productionPaths : undefined,
    });
    if (!replacement.containerId) {
      throw new Error("Route repair replacement produced no container");
    }
    replacementContainerId = replacement.containerId;

    await attachLinkedNetworks(opts.project.id, dockerRuntime, () => {});
    await repos.deployment.setContainerId(opts.deployment.id, replacement.containerId);
    await dockerRuntime.destroy(opts.deployment.containerId).catch(() => {});
  } catch (error) {
    if (replacementContainerId) {
      await dockerRuntime.destroy(replacementContainerId).catch(() => {});
    }
    const message = error instanceof Error ? error.message : "unknown container replacement error";
    for (const route of readyRoutes) failures.push({ hostname: route.hostname, message });
  }
  return { failures, attemptedRoutes };
}
