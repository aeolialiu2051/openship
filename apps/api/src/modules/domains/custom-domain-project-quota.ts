import { repos, withAdvisoryLock, type DatabaseDump } from "@repo/db";
import { AppError, type PlanTierId } from "@repo/core";
import { withKeyedMutex } from "../../lib/provision-lock";
import {
  resolveOrganizationPlanTier,
  UNLIMITED_CUSTOM_DOMAIN_PROJECT_TIERS,
} from "../../lib/plan-tier";

export const CUSTOM_DOMAIN_PROJECT_LIMIT_CODE = "CUSTOM_DOMAIN_PROJECT_LIMIT_REACHED";

type CustomDomainLike = {
  domainType?: string | null;
  customDomain?: string | null;
  publicEndpoints?: unknown;
};

export interface CustomDomainProjectClaim {
  projectId: string;
  projectName: string;
}

export interface CustomDomainProjectQuota {
  tier: PlanTierId;
  limit: number | null;
  used: number;
  remaining: number | null;
  claimedProjects: CustomDomainProjectClaim[];
}

export class CustomDomainProjectLimitError extends AppError {
  public readonly details: {
    limit: number;
    claimedProjectId: string;
    claimedProjectName: string;
  };

  constructor(claim: CustomDomainProjectClaim) {
    super(
      `Free accounts can use custom domains on only one project. “${claim.projectName}” already uses this entitlement. Upgrade to Pro to use custom domains on another project.`,
      403,
      CUSTOM_DOMAIN_PROJECT_LIMIT_CODE,
    );
    this.name = "CustomDomainProjectLimitError";
    this.details = {
      limit: 1,
      claimedProjectId: claim.projectId,
      claimedProjectName: claim.projectName,
    };
  }
}

function endpointHasCustomDomain(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const endpoint = value as { domainType?: unknown; customDomain?: unknown };
  return (
    endpoint.domainType === "custom" &&
    typeof endpoint.customDomain === "string" &&
    endpoint.customDomain.trim().length > 0
  );
}

function dumpCustomDomainProjects(dump: DatabaseDump): CustomDomainProjectClaim[] {
  const names = new Map(
    (dump.tables.project ?? []).flatMap((row) =>
      typeof row.id === "string"
        ? [[row.id, typeof row.name === "string" ? row.name : row.id] as const]
        : [],
    ),
  );
  const projectIds = new Set<string>();

  for (const row of dump.tables.domain ?? []) {
    if (typeof row.projectId !== "string") continue;
    if (row.ownerType !== undefined && row.ownerType !== null && row.ownerType !== "project") {
      continue;
    }
    // null/absent domainType is the legacy custom-domain representation.
    if (row.domainType === "free") continue;
    projectIds.add(row.projectId);
  }

  for (const row of dump.tables.service ?? []) {
    if (typeof row.projectId !== "string") continue;
    if (hasCustomDomainConfiguration(row as CustomDomainLike)) {
      projectIds.add(row.projectId);
    }
  }

  return [...projectIds].map((projectId) => ({
    projectId,
    projectName: names.get(projectId) ?? projectId,
  }));
}

/** True when a service/config payload claims at least one custom hostname. */
export function hasCustomDomainConfiguration(value: CustomDomainLike): boolean {
  if (
    value.domainType === "custom" &&
    typeof value.customDomain === "string" &&
    value.customDomain.trim().length > 0
  ) {
    return true;
  }

  return (
    Array.isArray(value.publicEndpoints) && value.publicEndpoints.some(endpointHasCustomDomain)
  );
}

export function hasAnyCustomDomainConfiguration(
  values: readonly CustomDomainLike[] | null | undefined,
): boolean {
  return (values ?? []).some(hasCustomDomainConfiguration);
}

async function listClaimedProjects(organizationId: string): Promise<CustomDomainProjectClaim[]> {
  const [domainClaims, serviceRoutes] = await Promise.all([
    repos.domain.listCustomDomainProjectsByOrganization(organizationId),
    repos.service.listRoutingByOrganization(organizationId),
  ]);

  const claims = new Map<string, CustomDomainProjectClaim>();
  for (const claim of domainClaims) {
    claims.set(claim.projectId, claim);
  }
  for (const route of serviceRoutes) {
    if (!hasCustomDomainConfiguration(route)) continue;
    claims.set(route.projectId, {
      projectId: route.projectId,
      projectName: route.projectName,
    });
  }

  return [...claims.values()].sort((left, right) => left.projectId.localeCompare(right.projectId));
}

export async function getCustomDomainProjectQuota(
  organizationId: string,
): Promise<CustomDomainProjectQuota> {
  const [tier, claimedProjects] = await Promise.all([
    resolveOrganizationPlanTier(organizationId),
    listClaimedProjects(organizationId),
  ]);
  const unlimited = UNLIMITED_CUSTOM_DOMAIN_PROJECT_TIERS.has(tier);

  return {
    tier,
    limit: unlimited ? null : 1,
    used: claimedProjects.length,
    remaining: unlimited ? null : Math.max(0, 1 - claimedProjects.length),
    claimedProjects,
  };
}

/**
 * Assert that a project may persist custom-domain configuration. Free accounts
 * may add any number of custom hostnames to their one claimed project, but no
 * other project may claim a hostname. Paid tiers are unlimited.
 *
 * Pass no projectId for a not-yet-created project: any existing claim blocks it.
 */
export async function assertCustomDomainProjectAllowed(
  organizationId: string,
  projectId?: string,
): Promise<void> {
  const quota = await getCustomDomainProjectQuota(organizationId);
  if (quota.limit === null || quota.claimedProjects.length === 0) return;
  if (projectId && quota.claimedProjects.every((claim) => claim.projectId === projectId)) {
    return;
  }

  const foreignClaim =
    quota.claimedProjects.find((claim) => claim.projectId !== projectId) ??
    quota.claimedProjects[0];
  throw new CustomDomainProjectLimitError(foreignClaim);
}

/** Serialize the entitlement check and the caller's persistence work. */
export function withCustomDomainProjectLock<T>(
  organizationId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = `custom-domain-project:${organizationId}`;
  return withKeyedMutex(key, () => withAdvisoryLock(key, fn));
}

export async function withCustomDomainProjectEntitlement<T>(
  organizationId: string,
  projectId: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return withCustomDomainProjectLock(organizationId, async () => {
    await assertCustomDomainProjectAllowed(organizationId, projectId);
    return fn();
  });
}

/**
 * Apply the same one-project rule to database subgraph restores, which bypass
 * normal domain/service mutation APIs. The check and restore share the org lock
 * so two concurrent imports cannot both introduce a different custom-domain
 * project.
 */
export async function withCustomDomainDumpEntitlement<T>(
  organizationId: string,
  dump: DatabaseDump,
  fn: () => Promise<T>,
): Promise<T> {
  const incomingClaims = dumpCustomDomainProjects(dump);
  if (incomingClaims.length === 0) return fn();

  return withCustomDomainProjectLock(organizationId, async () => {
    const [tier, existingClaims] = await Promise.all([
      resolveOrganizationPlanTier(organizationId),
      listClaimedProjects(organizationId),
    ]);
    if (UNLIMITED_CUSTOM_DOMAIN_PROJECT_TIERS.has(tier)) return fn();

    const combined = new Map<string, CustomDomainProjectClaim>();
    for (const claim of existingClaims) combined.set(claim.projectId, claim);
    for (const claim of incomingClaims) combined.set(claim.projectId, claim);
    if (combined.size > 1) {
      const incomingIds = new Set(incomingClaims.map((claim) => claim.projectId));
      const conflict =
        existingClaims.find((claim) => !incomingIds.has(claim.projectId)) ??
        [...combined.values()][1] ??
        [...combined.values()][0];
      throw new CustomDomainProjectLimitError(conflict);
    }

    return fn();
  });
}
