import { repos, type Domain, type Project } from "@repo/db";
import { appendProjectRouteKey, ConflictError } from "@repo/core";
import { CloudRuntime } from "@repo/adapters";
import {
  normalizeStoredPublicEndpoints,
  publicEndpointHostname,
  type StoredPublicEndpoint,
} from "./public-endpoints";
import { platform } from "./controller-helpers";
import { getRoutingBaseDomain, managedDomainsUseCloudEdge } from "./routing-domains";
import { generateToken } from "./domain-token";
import {
  hasAnyCustomDomainConfiguration,
  withCustomDomainProjectEntitlement,
} from "../modules/domains/custom-domain-project-quota";

interface SyncProjectPublicRoutesInput {
  projectId: string;
  endpoints?: StoredPublicEndpoint[] | null;
  currentDomains?: Domain[] | null;
}

interface DesiredProjectRoute {
  hostname: string;
  targetPort?: number;
  targetPath?: string;
  domainType: "free" | "custom";
  isPrimary: boolean;
}

/**
 * If `hostname` is a managed `<slug>.<baseDomain>` (e.g. business-servio.vibrail.com),
 * return the slug. Otherwise null - custom domains aren't Oblien-issued.
 */
function managedSlug(hostname: string): string | null {
  const base = getRoutingBaseDomain().toLowerCase();
  const suffix = `.${base}`;
  const normalized = hostname.trim().toLowerCase();
  if (!normalized.endsWith(suffix)) return null;
  const slug = normalized.slice(0, -suffix.length);
  return slug.length > 0 ? slug : null;
}

/**
 * Ask Oblien whether a managed slug is free. Source of truth for `*.vibrail.com`
 * subdomains. Returns true/false on a definitive answer, null if we can't
 * reach Oblien - callers treat null as "fall back to local DB".
 */
async function checkManagedSlugAvailable(hostname: string): Promise<boolean | null> {
  if (!managedDomainsUseCloudEdge()) return null;
  const slug = managedSlug(hostname);
  if (!slug) return null;

  const runtime = platform().runtime;
  if (!(runtime instanceof CloudRuntime)) return null;

  try {
    const result = await runtime.checkSlug(slug, getRoutingBaseDomain());
    return result.available;
  } catch {
    return null;
  }
}

/**
 * `findByHostname` finds rows regardless of project state. If the conflicting
 * row belongs to a soft-deleted project, treat it as an orphan: hard-delete it
 * and report no conflict, so the redeploy can proceed.
 */
async function resolveLocalConflict(domainRow: Domain, projectId: string): Promise<Domain | null> {
  if (domainRow.projectId === projectId) return domainRow;

  const owner = await repos.project.findById(domainRow.projectId);
  if (!owner) {
    // Project gone entirely - orphan row, drop it.
    await repos.domain.remove(domainRow.id);
    return null;
  }
  return domainRow;
}

function desiredProjectRoutes(endpoints?: StoredPublicEndpoint[] | null): DesiredProjectRoute[] {
  const seen = new Set<string>();

  return normalizeStoredPublicEndpoints(endpoints).flatMap((endpoint, index) => {
    const hostname = publicEndpointHostname(endpoint);
    if (!hostname || seen.has(hostname)) return [];

    seen.add(hostname);
    return [
      {
        hostname,
        targetPort: endpoint.port,
        targetPath: endpoint.targetPath,
        domainType: endpoint.domainType,
        isPrimary: index === 0,
      } satisfies DesiredProjectRoute,
    ];
  });
}

export async function syncProjectPublicRoutes(
  input: SyncProjectPublicRoutesInput,
): Promise<StoredPublicEndpoint[]> {
  const project = await repos.project.findById(input.projectId);
  if (!project) {
    throw new Error(`Cannot sync routes for missing project ${input.projectId}`);
  }

  if (hasAnyCustomDomainConfiguration(input.endpoints)) {
    return withCustomDomainProjectEntitlement(project.organizationId, project.id, () =>
      syncProjectPublicRoutesUnlocked(input, project),
    );
  }
  return syncProjectPublicRoutesUnlocked(input, project);
}

async function syncProjectPublicRoutesUnlocked(
  input: SyncProjectPublicRoutesInput,
  project: Project,
): Promise<StoredPublicEndpoint[]> {
  const allExistingDomains =
    input.currentDomains ?? (await repos.domain.listByProject(input.projectId));
  const routeKey = project.routeKey;

  const existingProjectHostnames = new Set(
    allExistingDomains
      .filter((domain) => domain.projectId === input.projectId)
      .map((domain) => domain.hostname.toLowerCase()),
  );
  const baseDomain = getRoutingBaseDomain().toLowerCase();
  const endpoints = normalizeStoredPublicEndpoints(input.endpoints).map((endpoint) => {
    if (endpoint.domainType === "custom" || !endpoint.domain) return endpoint;

    // Preserve hostnames created before route keys existed. Projects created
    // after the migration have a stable key; legacy projects intentionally
    // remain unsuffixed so an ordinary redeploy cannot change their public URL.
    const currentHostname = `${endpoint.domain}.${baseDomain}`.toLowerCase();
    if (existingProjectHostnames.has(currentHostname)) return endpoint;

    return routeKey
      ? {
          ...endpoint,
          domain: appendProjectRouteKey(endpoint.domain, routeKey),
        }
      : endpoint;
  });
  const existingDomains = allExistingDomains.filter((domain) => !domain.serviceId);
  const desiredRoutes = desiredProjectRoutes(endpoints);
  const desiredByHostname = new Map(desiredRoutes.map((route) => [route.hostname, route]));
  const existingByHostname = new Map(
    allExistingDomains.map((domain) => [domain.hostname.toLowerCase(), domain]),
  );

  for (const domain of existingDomains) {
    if (!desiredByHostname.has(domain.hostname.toLowerCase())) {
      await repos.domain.remove(domain.id);
      existingByHostname.delete(domain.hostname.toLowerCase());
    }
  }

  for (const route of desiredRoutes) {
    let existing = existingByHostname.get(route.hostname);

    // A route IS a domain. Free (`*.vibrail.com`) routes are host-managed → live
    // immediately. CUSTOM routes must prove DNS ownership first, so a NEW
    // custom row is created pending (with a deterministic verification token)
    // and only the /verify endpoint promotes it. This is the single place that
    // decides verification for endpoint-created rows — the old behavior
    // silently marked custom domains verified with no DNS check.
    const verificationFields =
      route.domainType === "custom"
        ? {
            status: "pending" as const,
            verified: false,
            verificationToken: generateToken(route.hostname),
          }
        : { status: "active" as const, verified: true, verifiedAt: new Date() };

    if (!existing) {
      const globalExisting = await repos.domain.findByHostname(route.hostname);
      if (globalExisting) {
        const resolved = await resolveLocalConflict(globalExisting, input.projectId);
        if (resolved && resolved.projectId !== input.projectId) {
          throw new ConflictError(`Domain "${route.hostname}" is already in use`);
        }
        if (resolved) {
          existing = resolved;
          existingByHostname.set(route.hostname, resolved);
        }
      }
    }

    // For Oblien-managed slugs (e.g. *.vibrail.com), Oblien is the source of truth.
    // If local DB looks free but Oblien says taken, surface the real conflict.
    if (!existing) {
      const oblienAvailable = await checkManagedSlugAvailable(route.hostname);
      if (oblienAvailable === false) {
        throw new ConflictError(`Domain "${route.hostname}" is already in use`);
      }
    }

    if (!existing) {
      let created: Domain;
      try {
        created = await repos.domain.create({
          projectId: input.projectId,
          serviceId: null,
          hostname: route.hostname,
          targetPort: route.targetPort,
          targetPath: route.targetPath,
          domainType: route.domainType,
          isPrimary: route.isPrimary,
          ...verificationFields,
        });
      } catch (err: any) {
        if (err?.cause?.code === "23505" || err?.code === "23505") {
          const conflicting = await repos.domain.findByHostname(route.hostname);
          if (conflicting) {
            const resolved = await resolveLocalConflict(conflicting, input.projectId);
            if (resolved && resolved.projectId !== input.projectId) {
              throw new ConflictError(`Domain "${route.hostname}" is already in use`);
            }
            if (resolved) {
              created = resolved;
            } else {
              // Orphan removed - retry the insert once.
              created = await repos.domain.create({
                projectId: input.projectId,
                serviceId: null,
                hostname: route.hostname,
                targetPort: route.targetPort,
                targetPath: route.targetPath,
                domainType: route.domainType,
                isPrimary: route.isPrimary,
                ...verificationFields,
              });
            }
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }

      existingByHostname.set(route.hostname, created);
      continue;
    }

    const patch: Record<string, unknown> = {};
    if ((existing.serviceId ?? null) !== null) patch.serviceId = null;
    if ((existing.targetPort ?? null) !== (route.targetPort ?? null))
      patch.targetPort = route.targetPort ?? null;
    if ((existing.targetPath ?? null) !== (route.targetPath ?? null))
      patch.targetPath = route.targetPath ?? null;
    if ((existing.domainType ?? null) !== route.domainType) patch.domainType = route.domainType;
    if (existing.isPrimary !== route.isPrimary) patch.isPrimary = route.isPrimary;
    // Auto-verify only host-managed (free) rows. A custom row's verified/status
    // is owned by the /verify DNS check — a re-save (port edit, reorder) must
    // NOT silently verify a pending custom nor reset a verified one.
    if (route.domainType !== "custom") {
      if (!existing.verified) {
        patch.verified = true;
        patch.verifiedAt = new Date();
      }
      if (existing.status !== "active") patch.status = "active";
    }

    if (Object.keys(patch).length > 0) {
      await repos.domain.update(existing.id, patch);
      existingByHostname.set(route.hostname, { ...existing, ...patch } as Domain);
    }
  }

  return endpoints;
}
