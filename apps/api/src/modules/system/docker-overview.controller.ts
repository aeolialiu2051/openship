import type { Context } from "hono";
import { repos } from "@repo/db";
import { safeErrorMessage } from "@repo/core";
import { USER_SERVERS_ENABLED } from "../../config";
import { sshManager } from "../../lib/ssh-manager";
import { getRequestContext } from "../../lib/request-context";
import { permission } from "../../lib/permission";
import { isSshAuthError } from "@repo/adapters";
import {
  DOCKER_OVERVIEW_COMMAND,
  parseDockerOverview,
  type DockerContainerOverview,
} from "./docker-overview";

interface RunningProjectOverview {
  id: string;
  name: string;
  slug: string;
  environmentName: string;
  environmentSlug: string;
  isApp: boolean;
  containers: DockerContainerOverview[];
}

function runningProjectsFor(
  containers: DockerContainerOverview[],
  projects: Awaited<ReturnType<typeof repos.project.findManyByIdsInOrganization>>,
): RunningProjectOverview[] {
  const runningByProject = new Map<string, DockerContainerOverview[]>();
  for (const container of containers) {
    // Build helpers also carry vibrail.project, but they are transient build
    // infrastructure rather than a running project workload.
    if (!container.running || !container.projectId || container.buildId) continue;
    const rows = runningByProject.get(container.projectId) ?? [];
    rows.push(container);
    runningByProject.set(container.projectId, rows);
  }

  return projects
    .flatMap((project): RunningProjectOverview[] => {
      const runningContainers = runningByProject.get(project.id);
      if (!runningContainers?.length) return [];
      return [
        {
          id: project.id,
          name: project.name,
          slug: project.slug,
          environmentName: project.environmentName,
          environmentSlug: project.environmentSlug,
          isApp: project.isApp,
          containers: runningContainers,
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Read-only, on-demand Docker container metrics for the server overview. */
export async function getDockerOverview(c: Context) {
  if (!USER_SERVERS_ENABLED) return c.json({ error: "Not available" }, 404);

  const requestContext = getRequestContext(c);
  const serverId = c.req.param("id")!;
  await permission.assert(requestContext, {
    resourceType: "server",
    resourceId: serverId,
    action: "read",
  });

  const server = await repos.server.getInOrganization(serverId, requestContext.organizationId);
  if (!server) return c.json({ error: "Server not found" }, 404);

  try {
    const raw = await sshManager.withExecutor(serverId, (executor) =>
      executor.exec(DOCKER_OVERVIEW_COMMAND, { timeout: 20_000 }),
    );
    const containers = parseDockerOverview(raw);
    const projectIds = [
      ...new Set(
        containers
          .filter((container) => container.running && !container.buildId)
          .map((container) => container.projectId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const projects = await repos.project.findManyByIdsInOrganization(
      projectIds,
      requestContext.organizationId,
    );
    const runningProjects = runningProjectsFor(containers, projects);
    const runningContainers = containers.filter((container) => container.running).length;

    return c.json({
      server: {
        id: server.id,
        name: server.name,
        isLocal: server.isLocal,
        sshHost: server.sshHost,
        sshPort: server.sshPort,
        sshUser: server.sshUser,
      },
      summary: {
        runningProjects: runningProjects.length,
        runningContainers,
        totalContainers: containers.length,
      },
      projects: runningProjects,
      containers,
      collectedAt: new Date().toISOString(),
    });
  } catch (err) {
    const rawMessage = safeErrorMessage(err);
    const message = /aborted|abortsignal|timed?\s*out/i.test(rawMessage)
      ? "Docker metrics collection timed out. Retry after checking the Docker daemon."
      : rawMessage;
    if (isSshAuthError(err)) {
      return c.json({ error: "auth_failed", message }, 400);
    }
    return c.json({ error: "docker_unavailable", message }, 502);
  }
}
