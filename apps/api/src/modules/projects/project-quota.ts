import { repos } from "@repo/db";
import { AppError, type PlanTierId } from "@repo/core";
import { getRuntimeConfig } from "../../lib/runtime-config";
import { resolveOrganizationPlanTier } from "../../lib/plan-tier";

const UNLIMITED_PROJECT_TIERS = new Set<PlanTierId>(["pro", "team", "enterprise"]);
export const PROJECT_LIMIT_REACHED_CODE = "PROJECT_LIMIT_REACHED";

export class ProjectLimitReachedError extends AppError {
  public readonly details: { limit: number };

  constructor(limit: number) {
    super(`Project limit reached (${limit})`, 400, PROJECT_LIMIT_REACHED_CODE);
    this.name = "ProjectLimitReachedError";
    this.details = { limit };
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
  const tier = await resolveOrganizationPlanTier(organizationId);
  if (UNLIMITED_PROJECT_TIERS.has(tier)) return;

  const { CLOUD_MAX_PROJECTS_PER_USER: cap } = await getRuntimeConfig();
  const { total } = await repos.projectGroup.listByOrganization(organizationId, {
    page: 1,
    perPage: 1,
  });
  if (total >= cap) {
    throw new ProjectLimitReachedError(cap);
  }
}
