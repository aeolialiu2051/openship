import { repos } from "@repo/db";
import { ValidationError, type PlanTierId } from "@repo/core";
import { getRuntimeConfig } from "../../lib/runtime-config";
import { resolveOrganizationPlanTier } from "../../lib/plan-tier";

const UNLIMITED_PROJECT_TIERS = new Set<PlanTierId>(["pro", "team", "enterprise"]);

/**
 * Enforce the configured Free project cap for every project target.
 *
 * Cloud and self-hosted creation both pass through this guard. Pro and higher
 * tiers are unlimited. The count is per organization on the control plane
 * performing the creation; existing projects are never removed when the cap
 * is lowered.
 */
export async function assertProjectQuota(organizationId: string): Promise<void> {
  const tier = await resolveOrganizationPlanTier(organizationId);
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
