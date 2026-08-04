import { repos } from "@repo/db";
import { ValidationError, type PlanTierId } from "@repo/core";
import { env } from "../../config";
import { getRuntimeConfig } from "../../lib/runtime-config";

const UNLIMITED_PROJECT_TIERS = new Set<PlanTierId>([
  "pro",
  "team",
  "enterprise",
]);

function asPlanTier(value: unknown): PlanTierId | null {
  return value === "free" || value === "pro" || value === "team" || value === "enterprise"
    ? value
    : null;
}

/**
 * Resolve the subscription tier that owns project entitlements.
 *
 * The SaaS has the authoritative tier on its organization row. A self-hosted
 * instance normally keeps a local free organization and proxies billing to
 * Vibrail Cloud, so it asks the cloud billing state first. If the instance is
 * offline or not connected, the local row is the safe fallback (free by
 * default), which keeps the Free limit enforced instead of failing open.
 */
async function resolveProjectPlanTier(organizationId: string): Promise<PlanTierId> {
  const organization = await repos.organization.findById(organizationId);
  const localTier = asPlanTier(organization?.planTierId) ?? "free";

  if (env.CLOUD_MODE) return localTier;

  try {
    const { cloudClient } = await import("../../lib/cloud/client");
    const response = await cloudClient({ organizationId }).request("/api/billing/state");
    if (!response?.ok) return localTier;

    const payload = (await response.json()) as { data?: { tier?: unknown } };
    return asPlanTier(payload.data?.tier) ?? localTier;
  } catch {
    return localTier;
  }
}

/**
 * Enforce the configured Free project cap for every project target.
 *
 * Cloud and self-hosted creation both pass through this guard. Pro and higher
 * tiers are unlimited. The count is per organization on the control plane
 * performing the creation; existing projects are never removed when the cap
 * is lowered.
 */
export async function assertProjectQuota(organizationId: string): Promise<void> {
  const tier = await resolveProjectPlanTier(organizationId);
  if (UNLIMITED_PROJECT_TIERS.has(tier)) return;

  const { CLOUD_MAX_PROJECTS_PER_USER: cap } = await getRuntimeConfig();
  const { total } = await repos.projectGroup.listByOrganization(organizationId, {
    page: 1,
    perPage: 1,
  });
  if (total >= cap) {
    throw new ValidationError(`Project limit reached (${cap})`);
  }
}
