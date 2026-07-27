import { isIP } from "node:net";
import { resolve4 } from "node:dns/promises";
import { repos } from "@repo/db";
import { env } from "../config/env";
import { decrypt } from "./encryption";
import { isNonPublicHost, resolveEdgeTargetHost } from "./edge-target";

interface CloudflareRecord {
  id: string;
  name: string;
  type: string;
  content: string;
}

interface CloudflareZone {
  id: string;
  name: string;
  status?: string;
}

interface CloudflareResponse<T> {
  success: boolean;
  result: T;
  errors?: Array<{ code?: number; message?: string }>;
}

interface CloudflareCredentials {
  zoneId: string;
  apiToken: string;
  proxied: boolean;
  source: "vibrail" | "organization";
}

export function normalizeDnsZoneDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^\.+|\.+$/g, "");
}

export function hostnameBelongsToZone(hostname: string, zoneDomain: string): boolean {
  const host = normalizeDnsZoneDomain(hostname);
  const zone = normalizeDnsZoneDomain(zoneDomain);
  return !!zone && (host === zone || host.endsWith(`.${zone}`));
}

export function isVibrailManagedHostname(hostname: string): boolean {
  const base = normalizeDnsZoneDomain(env.VIBRAIL_MANAGED_DOMAIN);
  const normalized = normalizeDnsZoneDomain(hostname);
  return normalized.endsWith(`.${base}`) && normalized !== base;
}

async function cloudflare<T>(
  credentials: Pick<CloudflareCredentials, "zoneId" | "apiToken">,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${credentials.zoneId}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${credentials.apiToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    },
  );
  const body = (await response.json().catch(() => null)) as CloudflareResponse<T> | null;
  if (!response.ok || !body?.success) {
    const detail = body?.errors?.map((error) => error.message || error.code).join(", ");
    throw new Error(
      `Cloudflare DNS request failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  return body.result;
}

/** Validate that a token can read the configured zone and that the supplied
 * domain is the actual Cloudflare zone apex. */
export async function verifyCloudflareZone(opts: {
  domain: string;
  zoneId: string;
  apiToken: string;
}): Promise<{ domain: string; zoneId: string; status?: string }> {
  const domain = normalizeDnsZoneDomain(opts.domain);
  const zone = await cloudflare<CloudflareZone>(
    { zoneId: opts.zoneId.trim(), apiToken: opts.apiToken.trim() },
    "",
  );
  const actual = normalizeDnsZoneDomain(zone.name);
  if (actual !== domain) {
    throw new Error(
      `Cloudflare Zone ID belongs to "${actual}", not "${domain}". Use the parent zone shown in Cloudflare Overview.`,
    );
  }
  // A read proves the token can reach DNS records before we accept it. The
  // first deployment will exercise DNS Edit by creating/updating the A record.
  await cloudflare<CloudflareRecord[]>(
    { zoneId: opts.zoneId.trim(), apiToken: opts.apiToken.trim() },
    "/dns_records?per_page=1",
  );
  return { domain: actual, zoneId: zone.id, ...(zone.status ? { status: zone.status } : {}) };
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

async function resolveCredentials(
  hostname: string,
  organizationId: string,
): Promise<CloudflareCredentials | null> {
  if (isVibrailManagedHostname(hostname)) {
    const apiToken = env.VIBRAIL_CLOUDFLARE_API_TOKEN;
    const zoneId = env.VIBRAIL_CLOUDFLARE_ZONE_ID;
    if (!apiToken || !zoneId) throw new Error("Vibrail Cloudflare DNS is not configured");
    return {
      apiToken,
      zoneId,
      proxied: env.VIBRAIL_CLOUDFLARE_PROXY,
      source: "vibrail",
    };
  }

  const settings = await repos.domainSettings.get(organizationId);
  if (!settings || !hostnameBelongsToZone(hostname, settings.domain)) return null;
  let apiToken: string;
  try {
    apiToken = decrypt(settings.cloudflareApiTokenEncrypted);
  } catch {
    throw new Error("The saved Cloudflare API token could not be decrypted; reconnect the domain");
  }
  return {
    apiToken,
    zoneId: settings.cloudflareZoneId,
    proxied: settings.cloudflareProxy,
    source: "organization",
  };
}

async function listRecords(
  credentials: CloudflareCredentials,
  hostname: string,
): Promise<CloudflareRecord[]> {
  return cloudflare<CloudflareRecord[]>(
    credentials,
    `/dns_records?name=${encodeURIComponent(hostname)}&per_page=100`,
  );
}

async function domainBelongsToOrganization(
  domainId: string,
  organizationId: string,
): Promise<boolean> {
  const domain = await repos.domain.findById(domainId);
  if (!domain?.projectId) return false;
  const project = await repos.project.findById(domain.projectId);
  return project?.organizationId === organizationId;
}

/** Create or update the A record for either a Vibrail hostname or a custom
 * hostname covered by the organization's connected Cloudflare zone. Tokens
 * remain in this backend process and are never passed to the target server. */
export async function upsertDeploymentDnsRecord(opts: {
  hostname: string;
  organizationId: string;
  serverId?: string;
}): Promise<"created" | "updated" | "skipped"> {
  const hostname = normalizeDnsZoneDomain(opts.hostname);
  const credentials = await resolveCredentials(hostname, opts.organizationId);
  if (!credentials) return "skipped";

  const content = await resolvePublicIpv4(opts.organizationId, opts.serverId);
  const records = await listRecords(credentials, hostname);
  const existing = records.find((record) => record.type === "A");
  const conflicting = records.find((record) => record.type !== "A");
  if (!existing && conflicting) {
    throw new Error(
      `${hostname} already has a ${conflicting.type} record in Cloudflare. Remove it before enabling automatic A-record management.`,
    );
  }

  const payload = JSON.stringify({
    type: "A",
    name: hostname,
    content,
    ttl: 1,
    proxied: credentials.proxied,
  });
  const record = existing
    ? await cloudflare<CloudflareRecord>(credentials, `/dns_records/${existing.id}`, {
        method: "PUT",
        body: payload,
      })
    : await cloudflare<CloudflareRecord>(credentials, "/dns_records", {
        method: "POST",
        body: payload,
      });

  if (credentials.source === "organization") {
    const row = await repos.domain.findByHostname(hostname);
    if (row && (await domainBelongsToOrganization(row.id, opts.organizationId))) {
      await repos.domain.markDnsManaged(row.id, "cloudflare", record.id || existing?.id || "");
      // Possession of a zone-scoped API token plus a successful DNS write is
      // stronger ownership proof than the manual TXT flow. Mark the custom
      // domain verified so the dashboard does not ask for a redundant manual
      // verification after a one-click deploy.
      if (!row.verified) await repos.domain.markVerified(row.id);
      if (row.sslStatus === "none" || row.sslStatus === "error") {
        await repos.domain.updateSsl(row.id, {
          sslStatus: "provisioning",
          sslIssuer: "letsencrypt",
        });
      }
    }
  }
  return existing ? "updated" : "created";
}

/** Delete DNS owned by Vibrail. Platform hostnames are always owned by the
 * platform; custom hostnames are deleted only when their domain row was marked
 * by a successful automatic upsert. */
export async function deleteDeploymentDnsRecord(opts: {
  hostname: string;
  organizationId: string;
}): Promise<void> {
  const hostname = normalizeDnsZoneDomain(opts.hostname);
  const platformManaged = isVibrailManagedHostname(hostname);
  const row = platformManaged ? null : await repos.domain.findByHostname(hostname);
  if (!platformManaged) {
    if (!row?.dnsManaged || row.dnsProvider !== "cloudflare" || !row.dnsRecordId) return;
    if (!(await domainBelongsToOrganization(row.id, opts.organizationId))) return;
  }

  const credentials = await resolveCredentials(hostname, opts.organizationId);
  if (!credentials) return;
  if (platformManaged) {
    const records = await listRecords(credentials, hostname);
    for (const record of records.filter((candidate) => candidate.type === "A")) {
      await cloudflare<CloudflareRecord>(credentials, `/dns_records/${record.id}`, {
        method: "DELETE",
      });
    }
    return;
  }

  try {
    await cloudflare<CloudflareRecord>(credentials, `/dns_records/${row!.dnsRecordId}`, {
      method: "DELETE",
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("(404)")) throw error;
  }
  await repos.domain.clearDnsManaged(row!.id);
}
