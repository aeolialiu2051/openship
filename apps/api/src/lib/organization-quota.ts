import { repos } from "@repo/db";
import type { PlanTierId } from "@repo/core";

export const FREE_ORGANIZATION_LIMIT = 1;
export const PAID_ORGANIZATION_LIMIT = 10;

export interface OrganizationQuota {
  count: number;
  limit: number;
  paid: boolean;
  reached: boolean;
}

const PAID_ORGANIZATION_TIERS = new Set<PlanTierId>([
  "pro",
  "team",
  "enterprise",
]);

function isOwnerRole(role: string): boolean {
  return role.split(",").includes("owner");
}

/**
 * Better Auth calls this predicate before creating an organization.
 *
 * An account receives the paid allowance only from an organization it owns;
 * merely being invited to somebody else's paid workspace must not unlock ten
 * workspaces for that account. Existing over-limit workspaces are preserved,
 * but no additional workspace can be created until the account is below its
 * current plan's limit.
 */
export async function getOrganizationQuota(
  userId: string,
): Promise<OrganizationQuota> {
  const memberships = await repos.member.listByUser(userId);
  const ownedOrganizationIds = memberships
    .filter((membership) => isOwnerRole(membership.role))
    .map((membership) => membership.organizationId);

  const ownedOrganizations = await repos.organization.findManyById(
    ownedOrganizationIds,
  );
  const hasPaidPlan = ownedOrganizations.some((organization) =>
    PAID_ORGANIZATION_TIERS.has(organization.planTierId as PlanTierId),
  );
  const limit = hasPaidPlan
    ? PAID_ORGANIZATION_LIMIT
    : FREE_ORGANIZATION_LIMIT;

  // Match Better Auth's established organizationLimit semantics: every
  // workspace the user belongs to counts toward the per-user cap.
  return {
    count: memberships.length,
    limit,
    paid: hasPaidPlan,
    reached: memberships.length >= limit,
  };
}

export async function hasReachedOrganizationLimit(userId: string): Promise<boolean> {
  return (await getOrganizationQuota(userId)).reached;
}
