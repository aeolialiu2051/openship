/**
 * Route rules compiled to native Traefik Docker-provider configuration.
 *
 * Docker container labels are immutable, so rules are persisted immediately
 * but become active on the next deployment/redeployment. Deployment pipelines
 * call `compileProjectTraefikRules` and embed the result in the workload labels.
 */

import { repos } from "@repo/db";
import type { RouteRuleSpec } from "@repo/core";
import type { TraefikRouteRuleConfig } from "@repo/adapters";

function ruleName(id: string): string {
  return `vibrail-rr-${id.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase()}`
    .slice(0, 63)
    .replace(/-+$/g, "");
}

function normalizePathPrefix(value: string | null): string | undefined {
  if (!value || value === "/") return undefined;
  return value.startsWith("/") ? value : `/${value}`;
}

function toTraefikRule(
  id: string,
  pathPrefix: string | null,
  spec: RouteRuleSpec,
): TraefikRouteRuleConfig | null {
  const sourceRange = spec.ipAllowList?.sourceRange ?? spec.access?.allowCidrs ?? [];
  const rateLimit = spec.rateLimit;
  const inFlightReq = spec.inFlightReq;
  if (!rateLimit && sourceRange.length === 0 && !inFlightReq) return null;

  return {
    name: ruleName(id),
    ...(normalizePathPrefix(pathPrefix) ? { pathPrefix: normalizePathPrefix(pathPrefix) } : {}),
    ...(rateLimit
      ? { rateLimit: { average: Math.max(1, rateLimit.rps), burst: Math.max(0, rateLimit.burst) } }
      : {}),
    ...(sourceRange.length > 0 ? { ipAllowList: { sourceRange } } : {}),
    ...(inFlightReq ? { inFlightReq: { amount: Math.max(1, inFlightReq.amount) } } : {}),
  };
}

/** Compile enabled project rules into hostname-keyed Traefik middleware input.
 * A null domainId fans out to all current project domains. */
export async function compileProjectTraefikRules(
  projectId: string,
): Promise<Record<string, TraefikRouteRuleConfig[]>> {
  const [rules, domains] = await Promise.all([
    repos.routeRule.listByProject(projectId),
    repos.domain.listByProject(projectId),
  ]);
  const hostById = new Map(domains.map((domain) => [domain.id, domain.hostname.toLowerCase()]));
  const allHosts = domains.map((domain) => domain.hostname.toLowerCase());
  const result: Record<string, TraefikRouteRuleConfig[]> = {};

  for (const row of rules) {
    if (!row.enabled) continue;
    const compiled = toTraefikRule(row.id, row.pathPrefix, row.spec);
    if (!compiled) continue;
    const hosts = row.domainId ? [hostById.get(row.domainId)].filter(Boolean) : allHosts;
    for (const host of hosts) {
      if (!host) continue;
      (result[host] ??= []).push(compiled);
    }
  }

  for (const entries of Object.values(result)) {
    entries.sort((a, b) => (b.pathPrefix?.length ?? 0) - (a.pathPrefix?.length ?? 0));
  }
  return result;
}
