import { env } from "../config/env";

export function isOblienConfigured(): boolean {
  return env.CLOUD_MODE || env.DEPLOY_MODE === "cloud";
}

/** Whether this process can call Oblien with master credentials. Local SaaS
 * may use CLOUD_MODE while only orchestrating user-owned VPS targets. */
export function hasOblienCredentials(): boolean {
  return Boolean(env.OBLIEN_CLIENT_ID && env.OBLIEN_CLIENT_SECRET);
}

export function isOblienBackedDeployment(
  deployTarget?: string | null,
  serverId?: string | null,
): boolean {
  // Local SaaS runs with CLOUD_MODE=true but can still orchestrate deployments
  // on user-owned servers. Deployment metadata is more specific than the API
  // process mode, so an attached server must always use that server's edge.
  if (serverId || deployTarget === "server") return false;
  return deployTarget === "cloud" || isOblienConfigured();
}
