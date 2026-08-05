import { repos } from "@repo/db";
import type { PlanTierId } from "@repo/core";
import { env } from "../config";

export const UNLIMITED_CUSTOM_DOMAIN_PROJECT_TIERS = new Set<PlanTierId>([
  "pro",
  "team",
  "enterprise",
]);

export function asPlanTier(value: unknown): PlanTierId | null {
  return value === "free" || value === "pro" || value === "team" || value === "enterprise"
    ? value
    : null;
}

/**
 * Resolve the plan tier that owns organization-scoped entitlements.
 *
 * Cloud reads its local organization row. Self-hosted instances normally keep
 * a local Free row and proxy billing to Vibrail Cloud, so they ask Cloud first
 * and fail closed to the local tier when disconnected.
 */
export async function resolveOrganizationPlanTier(organizationId: string): Promise<PlanTierId> {
  const organization = await repos.organization.findById(organizationId);
  const localTier = asPlanTier(organization?.planTierId) ?? "free";

  if (env.CLOUD_MODE) return localTier;

  try {
    const { cloudClient } = await import("./cloud/client");
    const response = await cloudClient({ organizationId }).request("/api/billing/state");
    if (!response?.ok) return localTier;

    const payload = (await response.json()) as { data?: { tier?: unknown } };
    return asPlanTier(payload.data?.tier) ?? localTier;
  } catch {
    return localTier;
  }
}
