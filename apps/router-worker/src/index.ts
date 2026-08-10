import {
  VIBRAIL_INTERNAL_HEADERS,
  isReservedServerHostname,
  normalizeHostname,
  originHostnameForServer,
  parseEdgeRoute,
  routeSignaturePayload,
  type EdgeRoute,
} from "@repo/core/managed-routing";

export interface Env {
  ROUTING: KVNamespace;
  VIBRAIL_ROUTER_MASTER_SECRET: string;
  VIBRAIL_ROUTER_PREVIOUS_MASTER_SECRET?: string;
  VIBRAIL_MANAGED_DOMAIN?: string;
  VIBRAIL_ROUTE_CACHE_TTL?: string;
  VIBRAIL_ROUTE_NEGATIVE_CACHE_TTL?: string;
}

type Cached = { route: EdgeRoute | null; expiresAt: number };
const memory = new Map<string, Cached>();

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

async function deriveServerSecret(master: string, serverId: string): Promise<string> {
  return hmac(master, `v1:${serverId}`);
}

function ttl(env: Env, negative: boolean): number {
  const parsed = Number(negative ? env.VIBRAIL_ROUTE_NEGATIVE_CACHE_TTL : env.VIBRAIL_ROUTE_CACHE_TTL);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 60) : negative ? 10 : 30;
}

async function loadRoute(hostname: string, env: Env, ctx: ExecutionContext): Promise<EdgeRoute | null> {
  const now = Date.now();
  const local = memory.get(hostname);
  if (local && local.expiresAt > now) return local.route;

  const cacheKey = new Request(`https://route-cache.invalid/${encodeURIComponent(hostname)}`);
  const edgeCache = (caches as CacheStorage & { default: Cache }).default;
  const cachedResponse = await edgeCache.match(cacheKey);
  if (cachedResponse) {
    const value = (await cachedResponse.json()) as unknown;
    const route = value === null ? null : parseEdgeRoute(value);
    memory.set(hostname, { route, expiresAt: now + ttl(env, route === null) * 1_000 });
    return route;
  }

  const raw = await env.ROUTING.get(`route:${hostname}`, "json");
  const route = raw === null ? null : parseEdgeRoute(raw);
  const seconds = ttl(env, route === null || !route.enabled);
  memory.set(hostname, { route, expiresAt: now + seconds * 1_000 });
  ctx.waitUntil(edgeCache.put(cacheKey, new Response(JSON.stringify(route), { headers: { "cache-control": `max-age=${seconds}` } })));
  return route;
}

function cleanHeaders(input: Headers): Headers {
  const headers = new Headers(input);
  for (const name of VIBRAIL_INTERNAL_HEADERS) headers.delete(name);
  return headers;
}

export async function routeRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let hostname: string;
  const baseDomain = env.VIBRAIL_MANAGED_DOMAIN ?? "vibrail.app";
  try {
    hostname = normalizeHostname(new URL(request.url).hostname);
    const normalizedBase = normalizeHostname(baseDomain);
    const managedLabel = hostname.endsWith(`.${normalizedBase}`)
      ? hostname.slice(0, -(normalizedBase.length + 1))
      : "";
    if (!managedLabel || managedLabel.includes(".") || isReservedServerHostname(hostname, baseDomain)) return new Response("Not found", { status: 404 });
  } catch {
    return new Response("Not found", { status: 404 });
  }

  let route: EdgeRoute | null;
  try {
    route = await loadRoute(hostname, env, ctx);
  } catch (error) {
    console.error(JSON.stringify({ event: "route_invalid", hostname, error: error instanceof Error ? error.message : "invalid" }));
    return new Response("Bad gateway", { status: 502 });
  }
  if (!route || !route.enabled) return new Response("Not found", { status: 404, headers: { "x-vibrail-route-status": "miss" } });
  if (!env.VIBRAIL_ROUTER_MASTER_SECRET) return new Response("Router unavailable", { status: 503 });

  const url = new URL(request.url);
  url.protocol = "https:";
  url.hostname = originHostnameForServer(route.server_id, baseDomain);
  url.port = "";
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const nonce = crypto.randomUUID();
  const headers = cleanHeaders(request.headers);
  const signatureInput = {
    method: request.method,
    hostname,
    pathAndQuery: `${url.pathname}${url.search}`,
    projectId: route.project_id,
    serviceId: route.service_id,
    serverId: route.server_id,
    routeVersion: route.version,
    timestamp,
    nonce,
  };
  const serverSecret = await deriveServerSecret(env.VIBRAIL_ROUTER_MASTER_SECRET, route.server_id);
  headers.set("x-vibrail-hostname", hostname);
  headers.set("x-vibrail-project-id", route.project_id);
  headers.set("x-vibrail-service-id", route.service_id ?? "");
  headers.set("x-vibrail-server-id", route.server_id);
  headers.set("x-vibrail-timestamp", timestamp);
  headers.set("x-vibrail-nonce", nonce);
  headers.set("x-vibrail-route-version", String(route.version));
  headers.set("x-vibrail-signature", await hmac(serverSecret, routeSignaturePayload(signatureInput)));

  try {
    const response = await fetch(url, { method: request.method, headers, body: request.body, redirect: "manual" });
    const routed = new Response(response.body, response);
    routed.headers.set("x-vibrail-route-status", "hit");
    routed.headers.set("x-vibrail-route-version", String(route.version));
    return routed;
  } catch (error) {
    console.error(JSON.stringify({ event: "origin_unavailable", hostname, server_id: route.server_id, version: route.version }));
    return new Response("Bad gateway", { status: 502 });
  }
}

export default { fetch: routeRequest } satisfies ExportedHandler<Env>;
