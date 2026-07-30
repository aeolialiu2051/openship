import { repos, type Project } from "@repo/db";
import { DockerRuntime, VIBRAIL_EDGE_CONTAINER } from "@repo/adapters";
import { safeErrorMessage } from "@repo/core";
import { resolveDeploymentRuntimeOnly } from "../../lib/deployment-runtime";

const edgeContainerByRuntime = new Map<string, string>();

function isTraefikSummary(container: {
  names: string[];
  image?: string;
  labels: Record<string, string>;
}): boolean {
  return (
    container.names.some((name) => name.replace(/^\//, "") === VIBRAIL_EDGE_CONTAINER) ||
    container.labels["vibrail.edge.managed"] === "true" ||
    /(^|\/|:)traefik(?::|@|$)/i.test(container.image ?? "")
  );
}

/** Locate the shared Traefik edge for a project without initializing the old
 * Traefik routing stack. The managed container name is inspected first so
 * the common path costs one Docker call; full-host discovery is only a fallback
 * for adopted/custom Traefik installations. The caller owns runtime disposal. */
export async function resolveTraefikLogSource(project: Project) {
  if (!project.activeDeploymentId) throw new Error("No active deployment for project");
  const dep = await repos.deployment.findById(project.activeDeploymentId);
  if (!dep) throw new Error("Active deployment not found");

  const resolved = await resolveDeploymentRuntimeOnly(
    { ...((dep.meta ?? {}) as Record<string, unknown>), runtimeMode: "docker" },
    { organizationId: dep.organizationId },
  );
  if (!(resolved.runtime instanceof DockerRuntime)) {
    await resolved.runtime.dispose?.();
    throw new Error("Traefik request logs require a Docker deployment");
  }

  try {
    const runtimeKey = resolved.serverId ?? dep.id;
    let managedEdge = null;
    try {
      const cachedContainerId = edgeContainerByRuntime.get(runtimeKey);
      managedEdge = await resolved.runtime.inspectContainer(
        cachedContainerId ?? VIBRAIL_EDGE_CONTAINER,
      );
      if (!managedEdge && cachedContainerId) edgeContainerByRuntime.delete(runtimeKey);
    } catch (error) {
      // Remote Docker CLI errors are not always normalized to Docker's HTTP
      // 404 shape. Treat only the explicit not-found forms as a cache miss;
      // connection/auth errors must still surface instead of triggering a slow
      // and misleading full-host scan.
      const message = safeErrorMessage(error);
      if (!/no such (object|container)|not found/i.test(message)) throw error;
      edgeContainerByRuntime.delete(runtimeKey);
    }
    if (managedEdge) {
      edgeContainerByRuntime.set(runtimeKey, managedEdge.id);
      return {
        runtime: resolved.runtime,
        serverId: resolved.serverId,
        containerId: managedEdge.id,
      };
    }

    const containers = await resolved.runtime.listAllContainers();
    const edge = containers.find(isTraefikSummary);
    if (!edge) throw new Error("No running Traefik edge was found on this server");
    edgeContainerByRuntime.set(runtimeKey, edge.id);
    return { runtime: resolved.runtime, serverId: resolved.serverId, containerId: edge.id };
  } catch (error) {
    await resolved.runtime.dispose?.();
    throw error;
  }
}
