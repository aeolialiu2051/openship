const DEFAULT_MANAGED_DOMAIN = "vibrail.app";
const MANAGED_KEY_LENGTH = 8;
const MAX_SLUG_LENGTH = 32;
const SERVER_ROUTING_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const MANAGED_KEY_PATTERN = /^[a-z0-9]{8}$/;
const ROUTE_ENTITY_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export type ManagedDomain = {
  slug: string;
  key: string;
  hostname: string;
};

export type EdgeRoute = {
  project_id: string;
  service_id: string | null;
  server_id: string;
  enabled: boolean;
  version: number;
  updated_at: string;
};

export type RouteSignatureInput = {
  method: string;
  hostname: string;
  pathAndQuery: string;
  projectId: string;
  serviceId: string | null;
  serverId: string;
  routeVersion: number;
  timestamp: string;
  nonce: string;
};

export function managedDomainSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-$/g, "");
  return slug || "app";
}

export function randomManagedKey(
  randomBytes: (length: number) => Uint8Array = (length) => crypto.getRandomValues(new Uint8Array(length)),
): string {
  // Rejection sampling avoids modulo bias while producing exactly eight base36 chars.
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  let result = "";
  while (result.length < MANAGED_KEY_LENGTH) {
    const bytes = randomBytes(MANAGED_KEY_LENGTH * 2);
    for (const byte of bytes) {
      if (byte >= 252) continue;
      result += chars[byte % chars.length];
      if (result.length === MANAGED_KEY_LENGTH) break;
    }
  }
  return result;
}

export function generateManagedDomain(
  name: string,
  options: { baseDomain?: string; key?: string } = {},
): ManagedDomain {
  const slug = managedDomainSlug(name);
  const key = options.key ?? randomManagedKey();
  if (!MANAGED_KEY_PATTERN.test(key)) throw new Error("Managed domain key must be 8 lowercase base36 characters");
  const baseDomain = normalizeHostname(options.baseDomain ?? DEFAULT_MANAGED_DOMAIN);
  return { slug, key, hostname: `${slug}-${key}.${baseDomain}` };
}

export function normalizeHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (normalized.length === 0 || normalized.length > 253) throw new Error("Invalid hostname");
  const labels = normalized.split(".");
  if (labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Error("Invalid hostname");
  }
  return normalized;
}

export function assertValidServerRoutingId(serverId: string): string {
  const normalized = serverId.trim().toLowerCase();
  if (!SERVER_ROUTING_ID_PATTERN.test(normalized)) throw new Error("Invalid server routing ID");
  return normalized;
}

export function originHostnameForServer(serverId: string, baseDomain = DEFAULT_MANAGED_DOMAIN): string {
  return `server-${assertValidServerRoutingId(serverId)}.${normalizeHostname(baseDomain)}`;
}

export function isReservedServerHostname(hostname: string, baseDomain = DEFAULT_MANAGED_DOMAIN): boolean {
  const normalized = normalizeHostname(hostname);
  const suffix = `.${normalizeHostname(baseDomain)}`;
  if (!normalized.endsWith(suffix)) return false;
  return normalized.slice(0, -suffix.length).startsWith("server-");
}

export function parseEdgeRoute(value: unknown): EdgeRoute {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid edge route");
  const route = value as Record<string, unknown>;
  if (typeof route.project_id !== "string" || !ROUTE_ENTITY_ID_PATTERN.test(route.project_id)) throw new Error("Invalid project ID");
  if (route.service_id !== null && (typeof route.service_id !== "string" || !ROUTE_ENTITY_ID_PATTERN.test(route.service_id))) throw new Error("Invalid service ID");
  if (typeof route.server_id !== "string") throw new Error("Invalid server ID");
  assertValidServerRoutingId(route.server_id);
  if (typeof route.enabled !== "boolean") throw new Error("Invalid enabled flag");
  if (!Number.isSafeInteger(route.version) || (route.version as number) < 1) throw new Error("Invalid route version");
  if (typeof route.updated_at !== "string" || route.updated_at.length > 64 || Number.isNaN(Date.parse(route.updated_at))) throw new Error("Invalid updated timestamp");
  return route as EdgeRoute;
}

export function routeSignaturePayload(input: RouteSignatureInput): string {
  return [
    input.method.toUpperCase(),
    normalizeHostname(input.hostname),
    input.pathAndQuery,
    input.projectId,
    input.serviceId ?? "",
    assertValidServerRoutingId(input.serverId),
    String(input.routeVersion),
    input.timestamp,
    input.nonce,
  ].join("\n");
}

export const VIBRAIL_INTERNAL_HEADERS = [
  "x-vibrail-hostname",
  "x-vibrail-project-id",
  "x-vibrail-service-id",
  "x-vibrail-server-id",
  "x-vibrail-timestamp",
  "x-vibrail-nonce",
  "x-vibrail-route-version",
  "x-vibrail-signature",
] as const;
