import type { Context } from "hono";
import { repos } from "@repo/db";
import { safeErrorMessage } from "@repo/core";
import { USER_SERVERS_ENABLED } from "../../config";
import { sshManager } from "../../lib/ssh-manager";
import { getRequestContext } from "../../lib/request-context";
import { permission } from "../../lib/permission";
import { isSshAuthError } from "@repo/adapters";
import { DOCKER_OVERVIEW_COMMAND, parseDockerOverview } from "./docker-overview";

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
    return c.json({ containers, collectedAt: new Date().toISOString() });
  } catch (err) {
    const message = safeErrorMessage(err);
    if (isSshAuthError(err)) {
      return c.json({ error: "auth_failed", message }, 400);
    }
    return c.json({ error: "docker_unavailable", message }, 502);
  }
}
