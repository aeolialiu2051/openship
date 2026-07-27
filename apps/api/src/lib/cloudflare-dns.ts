import { isIP } from "node:net";
import { resolve4 } from "node:dns/promises";
import { env } from "../config/env";
import { isNonPublicHost, resolveEdgeTargetHost } from "./edge-target";

interface CloudflareRecord {
  id: string;
  name: string;
  type: string;
  content: string;
}

interface CloudflareResponse<T> {
  success: boolean;
  result: T;
  errors?: Array<{ code?: number; message?: string }>;
}

function configured(): boolean {
  return !!(env.VIBRAIL_CLOUDFLARE_API_TOKEN && env.VIBRAIL_CLOUDFLARE_ZONE_ID);
}

export function isVibrailManagedHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  const base = env.VIBRAIL_MANAGED_DOMAIN.trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
  return normalized.endsWith(`.${base}`) && normalized !== base;
}

async function cloudflare<T>(path: string, init?: RequestInit): Promise<T> {
  const token = env.VIBRAIL_CLOUDFLARE_API_TOKEN;
  const zoneId = env.VIBRAIL_CLOUDFLARE_ZONE_ID;
  if (!token || !zoneId) throw new Error("Vibrail Cloudflare DNS is not configured");
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => null)) as CloudflareResponse<T> | null;
  if (!response.ok || !body?.success) {
    const detail = body?.errors?.map((error) => error.message || error.code).join(", ");
    throw new Error(
      `Cloudflare DNS request failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  return body.result;
}

async function resolvePublicIpv4(organizationId: string, serverId?: string): Promise<string> {
  const { host, reason } = await resolveEdgeTargetHost(organizationId, serverId);
  if (!host) throw new Error(reason ?? "The target server has no public address");
  if (isIP(host) === 4) {
    if (isNonPublicHost(host)) throw new Error(`The target server address (${host}) is not public`);
    return host;
  }
  const addresses = await resolve4(host);
  const address = addresses.find((candidate) => !isNonPublicHost(candidate));
  if (!address) throw new Error(`No public IPv4 address could be resolved for ${host}`);
  return address;
}

async function listRecords(hostname: string): Promise<CloudflareRecord[]> {
  return cloudflare<CloudflareRecord[]>(
    `/dns_records?name=${encodeURIComponent(hostname)}&per_page=100`,
  );
}

/** Create-or-update a proxied A record. The token stays in this backend module
 * and is never included in deployment/container environment variables. */
export async function upsertVibrailDnsRecord(opts: {
  hostname: string;
  organizationId: string;
  serverId?: string;
}): Promise<"created" | "updated" | "skipped"> {
  const hostname = opts.hostname.trim().toLowerCase();
  if (!isVibrailManagedHostname(hostname)) return "skipped";
  if (!configured()) throw new Error("Vibrail Cloudflare DNS is not configured");
  const content = await resolvePublicIpv4(opts.organizationId, opts.serverId);
  const existing = (await listRecords(hostname))[0];
  const payload = JSON.stringify({
    type: "A",
    name: hostname,
    content,
    ttl: 1,
    proxied: env.VIBRAIL_CLOUDFLARE_PROXY,
  });
  if (existing) {
    await cloudflare<CloudflareRecord>(`/dns_records/${existing.id}`, {
      method: "PUT",
      body: payload,
    });
    return "updated";
  }
  await cloudflare<CloudflareRecord>("/dns_records", { method: "POST", body: payload });
  return "created";
}

/** Delete every exact-name record owned by the managed Vibrail zone. */
export async function deleteVibrailDnsRecord(hostname: string): Promise<void> {
  const normalized = hostname.trim().toLowerCase();
  if (!isVibrailManagedHostname(normalized)) return;
  if (!configured()) throw new Error("Vibrail Cloudflare DNS is not configured");
  const records = await listRecords(normalized);
  for (const record of records) {
    await cloudflare<CloudflareRecord>(`/dns_records/${record.id}`, { method: "DELETE" });
  }
}
