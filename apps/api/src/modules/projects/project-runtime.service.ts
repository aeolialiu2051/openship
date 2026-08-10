/**
 * Project runtime service - logs, enable/disable (start/stop).
 */

import { repos } from "@repo/db";
import { NotFoundError, ValidationError } from "@repo/core";
import { BuildLogger, isMultiServiceRuntime, type LogEntry } from "@repo/adapters";
import {
  resolveDeploymentPlatform,
  resolveDeploymentRuntimeOnly,
  usesManagedRouting,
  type DeploymentMeta,
} from "../../lib/deployment-runtime";
import { assertResourceInOrg, platform } from "../../lib/controller-helpers";
import { syncManagedEdgeRoutes, edgeUnsyncedWarning } from "../../lib/managed-edge-proxy";
import { managedDomainsUseCloudEdge, resolveManagedHostname } from "../../lib/routing-domains";
import {
  clearAllRoutingWarnings,
  markServiceRoutingWarning,
} from "../../lib/deployment-routing-warning";
import { retryProjectServiceRoutes } from "../../lib/service-route-retry";
import { retryProjectApplicationRoutes } from "../../lib/project-route-retry";
import { deployComposeServices } from "../deployments/compose/deploy.service";

// ─── Runtime logs ────────────────────────────────────────────────────────────

export async function getRuntimeLogs(projectId: string, organizationId: string, tail?: number) {
  const p = await repos.project.findById(projectId);
  assertResourceInOrg(p, "Project", organizationId, projectId);

  if (!p.activeDeploymentId) {
    throw new NotFoundError("No active deployment for project", projectId);
  }

  const dep = await repos.deployment.findById(p.activeDeploymentId);
  if (!dep?.containerId) {
    throw new NotFoundError("No running container for project", projectId);
  }

  const { runtime } = await resolveDeploymentRuntimeOnly(dep.meta ?? {}, {
    organizationId: dep.organizationId,
  });
  try {
    return await runtime.getRuntimeLogs(dep.containerId, tail);
  } finally {
    await runtime.dispose?.();
  }
}

export async function streamRuntimeLogs(
  projectId: string,
  organizationId: string,
  onLog: (entry: LogEntry) => void,
  opts?: { tail?: number },
) {
  const p = await repos.project.findById(projectId);
  assertResourceInOrg(p, "Project", organizationId, projectId);

  if (!p.activeDeploymentId) {
    throw new NotFoundError("No active deployment for project", projectId);
  }

  const dep = await repos.deployment.findById(p.activeDeploymentId);
  if (!dep?.containerId) {
    throw new NotFoundError("No running container for project", projectId);
  }

  const { runtime, serverId } = await resolveDeploymentRuntimeOnly(dep.meta ?? {}, {
    organizationId: dep.organizationId,
  });
  try {
    const stop = await runtime.streamRuntimeLogs(dep.containerId, onLog, opts);
    return {
      serverId,
      cleanup: () => {
        try {
          stop();
        } finally {
          void runtime.dispose?.();
        }
      },
    };
  } catch (error) {
    await runtime.dispose?.();
    throw error;
  }
}

// ─── Enable / Disable ────────────────────────────────────────────────────────

/** Every runtime object that belongs to the active release. Compose releases
 * keep one row per service while deployment.containerId is only a legacy /
 * primary-container pointer. De-duplicate because the primary appears in both. */
export function runtimeContainerIds(
  deploymentContainerId: string | null,
  serviceDeployments: Array<{ containerId: string | null }>,
): string[] {
  const ids = serviceDeployments
    .map((row) => row.containerId)
    .filter((id): id is string => Boolean(id));
  if (deploymentContainerId) ids.push(deploymentContainerId);
  return [...new Set(ids)];
}

async function activeRuntime(projectId: string, organizationId: string) {
  const project = await repos.project.findById(projectId);
  assertResourceInOrg(project, "Project", organizationId, projectId);

  if (!project.activeDeploymentId) {
    throw new ValidationError("No deployment is available - deploy first");
  }

  const deployment = await repos.deployment.findById(project.activeDeploymentId);
  if (!deployment) {
    throw new ValidationError("Active deployment no longer exists");
  }
  const serviceDeployments = await repos.service.listByDeployment(deployment.id);
  const containerIds = runtimeContainerIds(deployment.containerId, serviceDeployments);
  if (containerIds.length === 0) {
    throw new ValidationError("No runtime containers found for active deployment");
  }

  const { runtime } = await resolveDeploymentRuntimeOnly(deployment.meta ?? {}, {
    organizationId: deployment.organizationId,
  });
  return { project, runtime, containerIds };
}

async function changeRuntimeState(
  projectId: string,
  organizationId: string,
  active: boolean,
) {
  const { runtime, containerIds } = await activeRuntime(projectId, organizationId);
  const completed: string[] = [];
  try {
    for (const containerId of containerIds) {
      if (active) await runtime.start(containerId);
      else await runtime.stop(containerId);
      completed.push(containerId);
    }
  } catch (error) {
    // Best-effort compensation keeps a multi-service project from being left
    // half enabled/disabled when one container operation fails.
    for (const containerId of completed.reverse()) {
      try {
        if (active) await runtime.stop(containerId);
        else await runtime.start(containerId);
      } catch {
        // Preserve the original error; the persisted state is left unchanged.
      }
    }
    if (
      active &&
      error instanceof Error &&
      /cannot be started after stopping|trigger a new deployment/i.test(error.message)
    ) {
      throw new ValidationError(
        "This process runtime cannot resume a stopped project. Redeploy the project to start it again.",
      );
    }
    throw error;
  } finally {
    await runtime.dispose?.();
  }

  await repos.project.update(projectId, {
    active,
    // Starting an existing release begins a new runtime session. Keep the
    // previous value while stopped so history is not replaced by stop time.
    ...(active ? { runtimeStartedAt: new Date() } : {}),
  });
  return {
    success: true,
    active,
    message: active ? "Project enabled" : "Project disabled",
  };
}

export async function enableProject(projectId: string, organizationId: string) {
  return changeRuntimeState(projectId, organizationId, true);
}

export async function disableProject(projectId: string, organizationId: string) {
  return changeRuntimeState(projectId, organizationId, false);
}

/** Retry the complete live routing chain WITHOUT rebuilding images: managed
 * cloud edge (when applicable), Cloudflare DNS/public propagation, and
 * Traefik publication. Docker recreates only affected service containers
 * because its routing labels are immutable; persistent volumes are preserved. */
export async function retryProjectRouting(
  projectId: string,
  organizationId: string,
): Promise<{ ok: boolean; warning?: string }> {
  const p = await repos.project.findById(projectId);
  assertResourceInOrg(p, "Project", organizationId, projectId);

  const dep = p.activeDeploymentId ? await repos.deployment.findById(p.activeDeploymentId) : null;
  if (!dep) {
    return { ok: false, warning: "No active deployment is available to rebuild routing." };
  }

  const edgeResult = await syncProjectManagedEdge(p, organizationId, {
    clearOnSuccess: false,
  });
  const routingFailures: string[] = edgeResult.ok
    ? []
    : [edgeUnsyncedWarning(edgeResult.failures, "retry")];

  const snapshot = (dep.meta ?? {}) as DeploymentMeta;
  const resolved = await resolveDeploymentPlatform(snapshot, {
    organizationId: dep.organizationId,
  });
  const runtime = resolved.platform.runtime;
  try {
    const serviceRetry = await retryProjectServiceRoutes({
      project: p,
      deployment: dep,
      runtime,
      routing: resolved.platform.routing,
      usesManagedRouting: usesManagedRouting(platform().target, resolved.effectiveTarget),
      serverId: resolved.serverId ?? undefined,
      ...(runtime.name === "docker" && isMultiServiceRuntime(runtime)
        ? {
            recreateDockerServices: async (serviceIds: string[]) => {
              const logger = new BuildLogger((entry) => {
                const line = entry.message.replace(/\n$/, "");
                if (!line) return;
                const prefix = "[routing-repair]";
                if (entry.level === "error" || entry.level === "warn") {
                  console.error(prefix, line);
                } else {
                  console.log(prefix, line);
                }
              });
              const result = await deployComposeServices(p, dep, runtime, logger, {
                targetServiceIds: new Set(serviceIds),
                strictScope: true,
                routing: resolved.platform.routing,
                ssl: resolved.platform.ssl,
                system: resolved.platform.system,
                executor: resolved.platform.executor,
                usesManagedRouting: true,
                serverId: resolved.serverId ?? undefined,
              });
              if (result.status === "failed") {
                throw new Error(result.error ?? "Docker service refresh failed");
              }
              if (result.routeWarnings?.length) {
                throw new Error(result.routeWarnings.join("; "));
              }
            },
          }
        : {}),
    });
    const applicationRetry = await retryProjectApplicationRoutes({
      project: p,
      deployment: dep,
      runtime,
      usesManagedRouting: usesManagedRouting(platform().target, resolved.effectiveTarget),
      serverId: resolved.serverId ?? undefined,
    });
    const routeFailures = [...serviceRetry.failures, ...applicationRetry.failures];
    if (routeFailures.length > 0) {
      routingFailures.push(
        `Routing retry still needs attention: ${routeFailures
          .map((failure) => `${failure.hostname}: ${failure.message}`)
          .join("; ")}`,
      );
    }
    const attemptedRoutes = serviceRetry.attemptedRoutes + applicationRetry.attemptedRoutes;
    if (attemptedRoutes === 0 && routingFailures.length === 0) {
      routingFailures.push(
        "Routing retry found no configured public route to repair. Check the project's domain and public endpoint settings.",
      );
    }
    if (routingFailures.length > 0) {
      const warning = routingFailures.join(" · ");
      await markServiceRoutingWarning(dep, warning);
      return { ok: false, warning };
    }

    await clearAllRoutingWarnings(dep);
    return { ok: true };
  } finally {
    await runtime.dispose?.();
  }
}

/**
 * Core managed free-domain (*.vibrail.com) edge reconciler, shared by the deploy
 * "retry routing" action and the live domain edit path — both need the SAME
 * idempotent slug→target upsert plus routing-warning bookkeeping.
 *
 *   - no managed domains  → clear any stale warning, ok.
 *   - all succeed         → clear the warning (project reads "Live" again).
 *   - any fail            → return the failures; when `markOnFailure`, persist
 *                           `meta.edgeUnsynced` so the project surfaces
 *                           "Action Required" / Retry. The edit path sets it
 *                           because the flag is the ONLY way the UI learns a
 *                           just-edited free URL is dead; retry leaves it as-is
 *                           (the deploy already set it).
 *
 * Best-effort per domain — never throws on a sync failure; returns the list.
 */
export async function syncProjectManagedEdge(
  project: NonNullable<Awaited<ReturnType<typeof repos.project.findById>>>,
  organizationId: string,
  opts: { markOnFailure?: boolean; clearOnSuccess?: boolean } = {},
): Promise<{ ok: boolean; failures: string[] }> {
  const dep = project.activeDeploymentId
    ? await repos.deployment.findById(project.activeDeploymentId)
    : null;
  const serverId = (dep?.meta as { serverId?: string } | null)?.serverId ?? undefined;

  // Operator-owned VIBRAIL_MANAGED_DOMAIN routes do not use the legacy Vibrail Cloud
  // edge bridge. Clear any warning left by an older deployment/configuration.
  if (!managedDomainsUseCloudEdge()) {
    if (opts.clearOnSuccess !== false) await clearRoutingWarning(dep);
    return { ok: true, failures: [] };
  }

  const targets = (await repos.domain.listByProject(project.id))
    .map((d) => ({ hostname: d.hostname, ...resolveManagedHostname(d.hostname) }))
    .filter((m) => m.isManaged && m.subdomain)
    .map((m) => ({ hostname: m.hostname, subdomain: m.subdomain! }));

  // No free .vibrail.com routes → nothing to sync; treat as resolved.
  if (targets.length === 0) {
    if (opts.clearOnSuccess !== false) await clearRoutingWarning(dep);
    return { ok: true, failures: [] };
  }

  // Same edge sync the deploy pipeline runs — re-invoking it is idempotent
  // (the SaaS upserts the slug→target route), so a retry/edit can't duplicate.
  const { failures } = await syncManagedEdgeRoutes(targets, { organizationId, serverId });
  if (failures.length > 0) {
    if (opts.markOnFailure) await markRoutingWarning(dep, edgeUnsyncedWarning(failures, "retry"));
    return { ok: false, failures };
  }

  if (opts.clearOnSuccess !== false) await clearRoutingWarning(dep);
  return { ok: true, failures: [] };
}

/** Drop the routing-unsynced markers from the active deployment's meta so the
 *  project no longer reads "Action Required" after a successful re-sync. */
async function clearRoutingWarning(
  dep: Awaited<ReturnType<typeof repos.deployment.findById>> | null,
): Promise<void> {
  if (!dep) return;
  const meta = { ...((dep.meta as Record<string, unknown> | null) ?? {}) };
  // A service edit owns this warning and must clear it only after its DNS and
  // live-proxy reconciliation succeeds. The managed-edge retry must not hide a
  // still-broken Cloudflare/Traefik service route.
  if (typeof meta.serviceRoutingWarning === "string") return;
  if (!("edgeUnsynced" in meta) && !("deployWarning" in meta)) return;
  delete meta.edgeUnsynced;
  delete meta.deployWarning;
  await repos.deployment.updateStatus(dep.id, dep.status, { meta });
}

/** Set the routing-unsynced markers so the project reads "Action Required" and
 *  the dashboard exposes "Retry routing" (see `routingUnsynced` in enrichProject). */
async function markRoutingWarning(
  dep: Awaited<ReturnType<typeof repos.deployment.findById>> | null,
  warning: string,
): Promise<void> {
  if (!dep) return;
  const meta = { ...((dep.meta as Record<string, unknown> | null) ?? {}) };
  meta.edgeUnsynced = true;
  meta.deployWarning = warning;
  await repos.deployment.updateStatus(dep.id, dep.status, { meta });
}
