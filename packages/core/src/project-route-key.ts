import { slugify } from "./utils";
import { randomManagedKey } from "./managed-routing";

const ROUTE_KEY_PATTERN = /^(?:[a-z0-9]{6}|[a-z0-9]{8})$/;

export interface ProjectRouteIdentity {
  slug: string;
  routeKey?: string | null;
}

/** Generate the canonical uniformly-distributed eight-character Base36 key. */
export function generateProjectRouteKey(): string {
  return randomManagedKey();
}

export function normalizeProjectRouteKey(routeKey: string): string {
  const normalized = routeKey.trim().toLowerCase();
  if (!ROUTE_KEY_PATTERN.test(normalized)) {
    throw new Error(`Invalid project route key: ${routeKey}`);
  }
  return normalized;
}

/** Append the stable key while keeping the DNS label within 63 characters. */
export function appendProjectRouteKey(label: string, routeKey: string): string {
  const key = normalizeProjectRouteKey(routeKey);
  const suffix = `-${key}`;
  const normalized = slugify(label) || "project";
  const unsuffixed = normalized.endsWith(suffix)
    ? normalized.slice(0, -suffix.length)
    : normalized;
  const base = unsuffixed.slice(0, 63 - suffix.length).replace(/-+$/, "") || "project";
  return `${base}${suffix}`;
}

/** Remove this project's key from a managed label without touching other suffixes. */
export function removeProjectRouteKey(label: string, routeKey: string): string {
  const key = normalizeProjectRouteKey(routeKey);
  const suffix = `-${key}`;
  const normalized = slugify(label) || "project";
  if (!normalized.endsWith(suffix)) return normalized;
  return normalized.slice(0, -suffix.length).replace(/-+$/, "") || "project";
}

/** Replace a preview/reserved key with the canonical key returned by the API. */
export function replaceProjectRouteKey(
  label: string,
  currentRouteKey: string,
  nextRouteKey: string,
): string {
  return appendProjectRouteKey(
    removeProjectRouteKey(label, currentRouteKey),
    nextRouteKey,
  );
}

export function projectRoutingSlug(project: ProjectRouteIdentity): string {
  return project.routeKey
    ? appendProjectRouteKey(project.slug, project.routeKey)
    : project.slug;
}
