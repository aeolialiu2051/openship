import {
  appendProjectRouteKey,
  removeProjectRouteKey,
  replaceProjectRouteKey,
} from "@repo/core";
import { normalizeSubdomainInput } from "../../utils/subdomain";
import type { DeploymentConfig } from "./types";

function stripManagedBaseDomain(domain: string, baseDomain?: string): string {
  const value = domain.trim().toLowerCase().replace(/\.$/, "");
  const normalizedBaseDomain = baseDomain
    ?.trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");

  if (!normalizedBaseDomain) return value;
  const suffix = `.${normalizedBaseDomain}`;
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}

/** Return only the user-editable part of a managed hostname. */
export function managedDomainForEditing(
  domain: string,
  domainType: "free" | "custom",
  routeKey?: string,
  baseDomain?: string,
): string {
  if (domainType === "custom" || !routeKey) return domain;
  const label = normalizeSubdomainInput(stripManagedBaseDomain(domain, baseDomain))
    .replace(/^-+|-+$/g, "");
  return label ? removeProjectRouteKey(label, routeKey) : "";
}

/** Reattach the immutable route key before writing a managed label to state. */
export function managedDomainFromEditing(
  domain: string,
  domainType: "free" | "custom",
  routeKey?: string,
  baseDomain?: string,
): string {
  if (domainType === "custom" || !routeKey) return domain;
  const label = normalizeSubdomainInput(stripManagedBaseDomain(domain, baseDomain))
    .replace(/^-+|-+$/g, "");
  return appendProjectRouteKey(label, routeKey);
}

export function managedDomainForApi(
  domain: string | undefined,
  domainType: "free" | "custom" | undefined,
  routeKey?: string,
): string | undefined {
  if (!domain || domainType === "custom" || !routeKey) return domain;
  return removeProjectRouteKey(domain, routeKey);
}

function canonicalManagedDomain(
  domain: string,
  domainType: "free" | "custom",
  currentRouteKey: string | undefined,
  nextRouteKey: string | undefined,
): string {
  if (!domain || domainType === "custom") return domain;
  if (!nextRouteKey) {
    return currentRouteKey
      ? removeProjectRouteKey(domain, currentRouteKey)
      : domain;
  }
  return currentRouteKey
    ? replaceProjectRouteKey(domain, currentRouteKey, nextRouteKey)
    : appendProjectRouteKey(domain, nextRouteKey);
}

export function canonicalizeDeploymentRouteKey(
  config: DeploymentConfig,
  nextRouteKey: string | undefined,
): DeploymentConfig {
  const currentRouteKey = config.routeKey;
  const mapEndpoints = (endpoints: DeploymentConfig["publicEndpoints"]) =>
    endpoints.map((endpoint) => ({
      ...endpoint,
      domain: canonicalManagedDomain(
        endpoint.domain,
        endpoint.domainType,
        currentRouteKey,
        nextRouteKey,
      ),
    }));
  const mapSnapshot = <T extends NonNullable<DeploymentConfig["modeSnapshots"]>["services"]>(
    snapshot: T,
  ): T => snapshot
    ? ({ ...snapshot, publicEndpoints: mapEndpoints(snapshot.publicEndpoints) } as T)
    : snapshot;

  return {
    ...config,
    routeKey: nextRouteKey,
    publicEndpoints: mapEndpoints(config.publicEndpoints),
    services: config.services.map((service) => ({
      ...service,
      domain: canonicalManagedDomain(
        service.domain ?? "",
        service.domainType === "custom" ? "custom" : "free",
        currentRouteKey,
        nextRouteKey,
      ) || undefined,
      publicEndpoints: service.publicEndpoints?.map((endpoint) => ({
        ...endpoint,
        domain: canonicalManagedDomain(
          endpoint.domain,
          endpoint.domainType,
          currentRouteKey,
          nextRouteKey,
        ),
      })),
    })),
    monorepoApps: config.monorepoApps?.map((app) => ({
      ...app,
      publicEndpoints: mapEndpoints(app.publicEndpoints),
    })),
    modeSnapshots: config.modeSnapshots
      ? {
          services: mapSnapshot(config.modeSnapshots.services),
          single: mapSnapshot(config.modeSnapshots.single),
        }
      : undefined,
  };
}
