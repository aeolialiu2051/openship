import { env } from "../config/env";

export function isOblienConfigured(): boolean {
  return env.CLOUD_MODE || env.DEPLOY_MODE === "cloud";
}

/** Whether this process can call Oblien with master credentials. Local SaaS
 * may use CLOUD_MODE while only orchestrating user-owned VPS targets. */
export function hasOblienCredentials(): boolean {
  return Boolean(env.OBLIEN_CLIENT_ID && env.OBLIEN_CLIENT_SECRET);
}

export function isOblienBackedDeployment(deployTarget?: string | null): boolean {
  return isOblienConfigured() || deployTarget === "cloud";
}
