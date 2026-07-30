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
  ttl?: number;
  proxied?: boolean;
  priority?: number;
  comment?: string;
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

export interface DnsPropagationProbeOptions {
  attempts?: number;
  intervalMs?: number;
  resolve?: (hostname: string) => Promise<string[]>;
  sleep?: (delayMs: number) => Promise<void>;
}

/**
 * Wait until a newly-written deployment hostname is visible through public DNS
 * before publishing a TLS router for it. Without this gate Traefik can ask ACME
 * while the hostname is still NXDOMAIN, cache the failed authorization, and
 * keep serving its default self-signed certificate even after DNS appears.
 */
export async function waitForDeploymentDnsPropagation(
  hostname: string,
  options: DnsPropagationProbeOptions = {},
): Promise<boolean> {
  const normalized = normalizeDnsZoneDomain(hostname);
  if (!normalized) return false;
  const attempts = Math.max(1, Math.floor(options.attempts ?? 30));
  const intervalMs = Math.max(0, Math.floor(options.intervalMs ?? 1_000));
  const resolver = options.resolve ?? resolve4;
  const sleep =
    options.sleep ??
    ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if ((await resolver(normalized)).length > 0) return true;
    } catch {
      // NXDOMAIN / propagation lag: retry within the bounded window below.
    }
    if (attempt + 1 < attempts && intervalMs > 0) await sleep(intervalMs);
  }
  return false;
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

  const settings = (await repos.domainSettings.list(organizationId))
    .filter((candidate) => hostnameBelongsToZone(hostname, candidate.domain))
    .sort((a, b) => b.domain.length - a.domain.length)[0];
  if (!settings) return null;
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

export interface ManagedDnsRecordInput {
  type: string;
  name: string;
  content: string;
  priority?: number;
}

function normalizedRecordContent(record: Pick<ManagedDnsRecordInput, "type" | "content">): string {
  const content = record.content.trim();
  return record.type.toUpperCase() === "MX" ? content.replace(/\.$/, "").toLowerCase() : content;
}

function sameManagedRecord(existing: CloudflareRecord, desired: ManagedDnsRecordInput): boolean {
  return (
    existing.type.toUpperCase() === desired.type.toUpperCase() &&
    normalizeDnsZoneDomain(existing.name) === normalizeDnsZoneDomain(desired.name) &&
    normalizedRecordContent(existing) === normalizedRecordContent(desired) &&
    (desired.type.toUpperCase() !== "MX" ||
      Number(existing.priority ?? 0) === Number(desired.priority ?? 0))
  );
}

function managesSameSlot(existing: CloudflareRecord, desired: ManagedDnsRecordInput): boolean {
  if (existing.type.toUpperCase() !== desired.type.toUpperCase()) return false;
  if (normalizeDnsZoneDomain(existing.name) !== normalizeDnsZoneDomain(desired.name)) return false;

  const type = desired.type.toUpperCase();
  if (["A", "AAAA", "CNAME"].includes(type)) return true;
  if (type !== "TXT") return false;

  const desiredContent = desired.content.trim().toLowerCase();
  const existingContent = existing.content.trim().toLowerCase();
  for (const prefix of ["v=spf1", "v=dmarc1", "v=dkim1"]) {
    if (desiredContent.startsWith(prefix)) return existingContent.startsWith(prefix);
  }
  return false;
}

/**
 * Publish DNS records without taking ownership of pre-existing user records.
 * Exact matches are left untouched; conflicting singleton records fail with a
 * clear error. Records created here are tagged so cleanup can delete exactly
 * Openship's writes even when the mail server or its remote state is gone.
 */
export async function publishManagedDnsRecords(opts: {
  records: ManagedDnsRecordInput[];
  organizationId: string;
  ownerTag: string;
}): Promise<"published" | "skipped"> {
  if (opts.records.length === 0) return "published";
  const resolved = await Promise.all(
    opts.records.map((record) => resolveCredentials(record.name, opts.organizationId)),
  );
  if (resolved.some((credentials) => !credentials)) return "skipped";
  const credentialsByRecord = resolved as CloudflareCredentials[];
  const firstCredentials = credentialsByRecord[0]!;
  if (credentialsByRecord.some((credentials) => credentials.zoneId !== firstCredentials.zoneId)) {
    throw new Error("Mail DNS records resolve to more than one connected DNS zone");
  }

  for (const [index, desired] of opts.records.entries()) {
    const credentials = credentialsByRecord[index]!;

    const existing = await listRecords(credentials, desired.name);
    if (existing.some((record) => sameManagedRecord(record, desired))) continue;
    const conflict = existing.find((record) => managesSameSlot(record, desired));
    if (conflict) {
      throw new Error(
        `${desired.name} already has a conflicting ${desired.type.toUpperCase()} record. Remove or update it before automatic mail DNS provisioning.`,
      );
    }

    await cloudflare<CloudflareRecord>(credentials, "/dns_records", {
      method: "POST",
      body: JSON.stringify({
        type: desired.type.toUpperCase(),
        name: normalizeDnsZoneDomain(desired.name),
        content: desired.content,
        ttl: 1,
        proxied: false,
        ...(desired.priority !== undefined ? { priority: desired.priority } : {}),
        comment: opts.ownerTag,
      }),
    });
  }
  return "published";
}

/** Delete only records carrying the exact ownership tag written above. */
export async function deleteManagedDnsRecords(opts: {
  domain: string;
  organizationId: string;
  ownerTag: string;
}): Promise<void> {
  const credentials = await resolveCredentials(opts.domain, opts.organizationId);
  if (!credentials) return;

  // A zone can contain more records than Cloudflare returns in one page.
  // Walk every page so old tagged records cannot be stranded in large zones.
  const pageSize = 5_000;
  const ownedRecordIds: string[] = [];
  for (let page = 1; ; page += 1) {
    const records = await cloudflare<CloudflareRecord[]>(
      credentials,
      `/dns_records?per_page=${pageSize}&page=${page}`,
    );
    ownedRecordIds.push(
      ...records
        .filter((candidate) => candidate.comment === opts.ownerTag)
        .map((record) => record.id),
    );
    if (records.length < pageSize) break;
  }

  for (const recordId of ownedRecordIds) {
    try {
      await cloudflare<CloudflareRecord>(credentials, `/dns_records/${recordId}`, {
        method: "DELETE",
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("(404)")) throw error;
    }
  }
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
