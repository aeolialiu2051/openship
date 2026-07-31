import { repos, type Deployment } from "@repo/db";

const SERVICE_ROUTING_WARNING_KEY = "serviceRoutingWarning";

type DeploymentLike = Deployment | null | undefined;

export function getServiceRoutingWarning(deployment: DeploymentLike): string | null {
  const meta = (deployment?.meta as Record<string, unknown> | null) ?? {};
  const warning = meta[SERVICE_ROUTING_WARNING_KEY];
  return typeof warning === "string" ? warning : null;
}

/**
 * Persist a live service-edit routing failure without rolling back the service
 * configuration. The structured marker lets a later successful edit clear only
 * the warning it owns, without hiding an unrelated deployment warning.
 */
export async function markServiceRoutingWarning(
  deployment: DeploymentLike,
  warning: string,
): Promise<void> {
  if (!deployment) return;
  const meta = { ...((deployment.meta as Record<string, unknown> | null) ?? {}) };
  meta[SERVICE_ROUTING_WARNING_KEY] = warning;
  meta.edgeUnsynced = true;
  meta.deployWarning = warning;
  await repos.deployment.updateStatus(deployment.id, deployment.status, { meta });
}

/** Clear only a warning previously written by markServiceRoutingWarning. */
export async function clearServiceRoutingWarning(deployment: DeploymentLike): Promise<void> {
  if (!deployment) return;
  const meta = { ...((deployment.meta as Record<string, unknown> | null) ?? {}) };
  const warning = meta[SERVICE_ROUTING_WARNING_KEY];
  if (typeof warning !== "string") return;

  delete meta[SERVICE_ROUTING_WARNING_KEY];
  if (meta.deployWarning === warning) delete meta.deployWarning;
  if (!("deployWarning" in meta)) delete meta.edgeUnsynced;
  await repos.deployment.updateStatus(deployment.id, deployment.status, { meta });
}

/** Clear every routing-owned marker after an explicit retry has successfully
 * rebuilt DNS and the live proxy route. This is intentionally stronger than
 * clearServiceRoutingWarning: deploy-time DNS propagation failures predate the
 * structured service warning key and only carry edgeUnsynced/deployWarning. */
export async function clearAllRoutingWarnings(deployment: DeploymentLike): Promise<void> {
  if (!deployment) return;
  const meta = { ...((deployment.meta as Record<string, unknown> | null) ?? {}) };
  const hadWarning =
    SERVICE_ROUTING_WARNING_KEY in meta || "edgeUnsynced" in meta || "deployWarning" in meta;
  if (!hadWarning) return;

  delete meta[SERVICE_ROUTING_WARNING_KEY];
  delete meta.edgeUnsynced;
  delete meta.deployWarning;
  await repos.deployment.updateStatus(deployment.id, deployment.status, { meta });
}
