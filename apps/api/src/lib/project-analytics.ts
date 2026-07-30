/**
 * Shared helpers for resolving a project's tracked domain, server,
 * and selecting the appropriate traffic source.
 *
 * Used by:
 *   - analytics.service.ts  (summary, periods)
 *   - project.controller.ts (server log stream, recent logs)
 */

import { repos, type Project } from "@repo/db";
import { isOblienBackedDeployment } from "./platform-mode";

// ─── Domain normalisation ────────────────────────────────────────────────────

/**
 * Normalize a hostname to the canonical traffic key format.
 */
export function normalizeTrackedDomain(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

// ─── Project → domain + server resolution ────────────────────────────────────

export interface ProjectTracking {
  domain: string;
  serverId: string;
}

export type ProjectTrafficSource =
  | {
      kind: "self-hosted";
      domain: string;
      serverId: string;
      deployTarget: string | null;
    }
  | {
      kind: "cloud";
      domain: string;
      deployTarget: "cloud";
    };

async function resolveTrafficRuntime(project: Project) {
  let deployTarget: string | null = null;
  let serverId: string | null = null;

  if (project.activeDeploymentId) {
    const dep = await repos.deployment.findById(project.activeDeploymentId);
    const meta = dep?.meta as { deployTarget?: string; serverId?: string } | null;
    deployTarget = meta?.deployTarget ?? null;
    if (meta?.serverId) serverId = meta.serverId;
  }

  return { deployTarget, serverId };
}

async function resolveProjectTrackedDomains(project: Project): Promise<string[]> {
  const rows = await repos.domain.listByProject(project.id);
  const hostnames = rows
    .map((domain) => domain.hostname)
    .filter((hostname): hostname is string => Boolean(hostname?.trim()))
    .map(normalizeTrackedDomain);

  return Array.from(new Set(hostnames));
}

/**
 * Resolve the tracked domain and server for a project.
 *
 * Domain resolution order:
 *   1. Primary domain from DB (`domain` table)
 *   2. Slug-based managed subdomain (`project.slug.baseDomain`)
 *
 * Server resolution order:
 *   1. Active deployment's `meta.serverId`
 *   2. First configured server (single-server setups)
 */
export async function resolveProjectTracking(projectId: string): Promise<ProjectTracking | null> {
  const source = await resolveProjectTrafficSource(projectId);
  if (!source || source.kind !== "self-hosted") {
    return null;
  }

  return { domain: source.domain, serverId: source.serverId };
}

/**
 * Map a fixed list of tracked domains to their traffic sources — the shared core
 * of the single/plural resolvers below. SaaS/OpenShip Cloud deploys observe
 * traffic at the Oblien edge; self-hosted deploys use their Traefik log source.
 * Empty domain list (or no resolvable server)
 * → no sources.
 */
async function buildTrafficSourcesForDomains(
  project: Project,
  domains: string[],
): Promise<ProjectTrafficSource[]> {
  if (domains.length === 0) return [];

  let { deployTarget, serverId } = await resolveTrafficRuntime(project);

  if (isOblienBackedDeployment(deployTarget, serverId)) {
    return domains.map((domain) => ({
      kind: "cloud" as const,
      domain,
      deployTarget: "cloud" as const,
    }));
  }

  // Server: deployment meta first, then first configured server.
  if (!serverId) {
    const servers = await repos.server.list();
    serverId = servers[0]?.id ?? null;
  }
  if (!serverId) return [];

  return domains.map((domain) => ({
    kind: "self-hosted" as const,
    domain,
    serverId,
    deployTarget,
  }));
}

/**
 * Resolve where request traffic is observed for ONE of the project's domains: a
 * validated `domain` override (route switch), else the primary tracked route.
 */
export async function resolveProjectTrafficSource(
  projectId: string,
  opts?: {
    /** Restrict traffic to ONE of the project's domains (route switch). Validated
     *  against the project's tracked domains — an unknown value is ignored and we
     *  fall back to the primary, so a client can never fetch logs for an arbitrary
     *  (cross-tenant) host. */
    domain?: string;
  },
): Promise<ProjectTrafficSource | null> {
  const project = await repos.project.findById(projectId);
  if (!project) return null;

  // Domain: a validated override (route switch), else the primary tracked route.
  let domain: string | null = null;
  const requested = opts?.domain?.trim();
  if (requested) {
    const normalized = normalizeTrackedDomain(requested);
    const tracked = (await resolveProjectTrackedDomains(project)).map(normalizeTrackedDomain);
    if (tracked.includes(normalized)) domain = normalized;
  }
  if (!domain) {
    const primaryDomain = await repos.domain.getPrimaryByProject(projectId);
    domain = primaryDomain?.hostname ? normalizeTrackedDomain(primaryDomain.hostname) : null;
  }
  if (!domain) return null;

  const [source] = await buildTrafficSourcesForDomains(project, [domain]);
  return source ?? null;
}

/**
 * Resolve all domains that should contribute to project-level overview analytics.
 * Normal apps usually have one domain; compose/service apps can have one domain
 * per exposed service, so the overview aggregates them.
 */
export async function resolveProjectTrafficSources(
  projectId: string,
  opts?: {
    /** Scope to ONE tracked domain (route switch). Validated + primary fallback,
     *  identical to resolveProjectTrafficSource, returned as a one-element array.
     *  Omit to aggregate every tracked domain. */
    domain?: string;
  },
): Promise<ProjectTrafficSource[]> {
  if (opts?.domain) {
    const source = await resolveProjectTrafficSource(projectId, { domain: opts.domain });
    return source ? [source] : [];
  }

  const project = await repos.project.findById(projectId);
  if (!project) return [];

  const domains = await resolveProjectTrackedDomains(project);
  return buildTrafficSourcesForDomains(project, domains);
}
