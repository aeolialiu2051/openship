import { createHmac, timingSafeEqual } from "node:crypto";
import {
  VIBRAIL_INTERNAL_HEADERS,
  normalizeHostname,
  routeSignaturePayload,
} from "@repo/core/managed-routing";

export interface NonceStore {
  claim(nonce: string, ttlSeconds: number): Promise<boolean>;
}

export interface DeploymentAuthority {
  isCurrent(input: { hostname: string; projectId: string; serviceId: string | null; serverId: string; routeVersion: number }): Promise<boolean>;
}

export type GatewayConfig = {
  serverId: string;
  currentServerSecret: string;
  previousServerSecret?: string;
  timestampSkewSeconds?: number;
  nonceStore: NonceStore;
  authority: DeploymentAuthority;
};

export class MemoryNonceStore implements NonceStore {
  private readonly values = new Map<string, number>();
  async claim(nonce: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.values.get(nonce);
    if (existing && existing > now) return false;
    this.values.set(nonce, now + ttlSeconds * 1_000);
    if (this.values.size > 10_000) for (const [key, expiry] of this.values) if (expiry <= now) this.values.delete(key);
    return true;
  }
}

export function deriveServerSecret(masterSecret: string, serverId: string): string {
  return createHmac("sha256", masterSecret).update(`v1:${serverId}`).digest("hex");
}

export function signRoute(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function signaturesEqual(actual: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(actual)) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

type VerifiedRoute = { hostname: string; projectId: string; serviceId: string | null; serverId: string; routeVersion: number };

export async function verifyOriginRequest(request: Request, config: GatewayConfig): Promise<{ ok: true; route: VerifiedRoute } | { ok: false; status: 403 | 404 }> {
  const get = (name: string) => request.headers.get(name) ?? "";
  const hostnameRaw = get("x-vibrail-hostname");
  const projectId = get("x-vibrail-project-id");
  const serviceId = get("x-vibrail-service-id") || null;
  const serverId = get("x-vibrail-server-id");
  const timestamp = get("x-vibrail-timestamp");
  const nonce = get("x-vibrail-nonce");
  const versionRaw = get("x-vibrail-route-version");
  const signature = get("x-vibrail-signature");
  if (!hostnameRaw || !projectId || !serverId || !timestamp || !nonce || !versionRaw || !signature) return { ok: false, status: 403 };

  let hostname: string;
  try { hostname = normalizeHostname(hostnameRaw); } catch { return { ok: false, status: 403 }; }
  const routeVersion = Number(versionRaw);
  const timestampNumber = Number(timestamp);
  if (!Number.isSafeInteger(routeVersion) || routeVersion < 1 || !Number.isSafeInteger(timestampNumber)) return { ok: false, status: 403 };
  const skew = config.timestampSkewSeconds ?? 60;
  if (Math.abs(Math.floor(Date.now() / 1_000) - timestampNumber) > skew) return { ok: false, status: 403 };
  if (serverId !== config.serverId) return { ok: false, status: 404 };

  const url = new URL(request.url);
  const payload = routeSignaturePayload({ method: request.method, hostname, pathAndQuery: `${url.pathname}${url.search}`, projectId, serviceId, serverId, routeVersion, timestamp, nonce });
  const valid = [config.currentServerSecret, config.previousServerSecret]
    .filter((secret): secret is string => !!secret)
    .some((secret) => signaturesEqual(signature, signRoute(secret, payload)));
  if (!valid) return { ok: false, status: 403 };
  if (!(await config.nonceStore.claim(nonce, skew * 2))) return { ok: false, status: 403 };

  const route = { hostname, projectId, serviceId, serverId, routeVersion };
  if (!(await config.authority.isCurrent(route))) return { ok: false, status: 404 };
  return { ok: true, route };
}

/** Verify first, then stream to the private Traefik listener. The public
 * server must expose only this handler; Traefik/container ports stay private. */
export async function gatewayRequest(request: Request, config: GatewayConfig, traefikOrigin = "http://127.0.0.1:8080"): Promise<Response> {
  const verified = await verifyOriginRequest(request, config);
  if (!verified.ok) return new Response(verified.status === 404 ? "Not found" : "Forbidden", { status: verified.status });
  const target = new URL(request.url);
  const trustedOrigin = new URL(traefikOrigin);
  target.protocol = trustedOrigin.protocol;
  target.hostname = trustedOrigin.hostname;
  target.port = trustedOrigin.port;
  const headers = new Headers(request.headers);
  for (const name of VIBRAIL_INTERNAL_HEADERS) headers.delete(name);
  headers.set("host", verified.route.hostname);
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual",
  };
  if (request.body) init.duplex = "half";
  return fetch(target, init);
}
