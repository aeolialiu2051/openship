/**
 * Shared DNS resolution helper for verification + preflight flows.
 *
 * Two consumers, identical requirements:
 *   - apps/api/src/modules/domains/domain.service.ts — domain
 *     ownership verification (A / CNAME / TXT).
 *   - apps/api/src/modules/deployments/preflight.ts — pre-deploy
 *     DNS sanity check (A / AAAA / CNAME).
 *
 * Resolution strategy: query Google DNS-over-HTTPS, Cloudflare
 * DNS-over-HTTPS, and node:dns concurrently, then accept records returned by
 * any source. A newly-created hostname can be stuck in one recursive
 * resolver's NXDOMAIN cache while another resolver already sees the record;
 * no single cache is allowed to block deployment routing.
 *
 * Returns `[]` when every source fails or has no answer. Callers decide
 * whether empty results mean "no records exist" or "DNS unreachable" —
 * typically both outcomes warrant the same user-facing "DNS isn't ready"
 * message.
 */

import dns from "node:dns/promises";

const GOOGLE_DNS = "https://dns.google/resolve";
const CLOUDFLARE_DNS = "https://cloudflare-dns.com/dns-query";
const DEFAULT_TIMEOUT_MS = 5_000;

const RRTYPE: Record<DnsRecordType, number> = {
  A: 1,
  AAAA: 28,
  CNAME: 5,
  TXT: 16,
};

export type DnsRecordType = "A" | "AAAA" | "CNAME" | "TXT";

interface DnsJsonAnswer {
  name: string;
  type: number;
  data: string;
}

export interface ResolveOptions {
  /** Per-source timeout for both DoH providers and node:dns. */
  timeoutMs?: number;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`dns_timeout:${label}`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolveViaLocal(name: string, type: DnsRecordType): Promise<string[]> {
  switch (type) {
    case "A":
      return dns.resolve4(name);
    case "AAAA":
      return dns.resolve6(name);
    case "CNAME":
      return dns.resolveCname(name);
    case "TXT": {
      const rows = await dns.resolveTxt(name);
      return rows.flat();
    }
  }
}

async function resolveViaDoh(
  endpoint: string,
  name: string,
  type: DnsRecordType,
  timeoutMs: number,
): Promise<string[]> {
  try {
    const url = `${endpoint}?name=${encodeURIComponent(name)}&type=${RRTYPE[type]}`;
    const response = await fetch(url, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return [];
    const json = (await response.json()) as { Answer?: DnsJsonAnswer[] };
    return (json.Answer ?? []).map((answer) => answer.data.replace(/^"|"$/g, ""));
  } catch {
    return [];
  }
}

/**
 * Resolve a DNS record through independent public and local sources. Results
 * are merged and deduplicated; an empty/NXDOMAIN response from one resolver
 * does not suppress a valid answer from another. Every source is bounded by
 * `timeoutMs` (default 5s), and they run concurrently.
 */
export async function resolveRecords(
  name: string,
  type: DnsRecordType,
  opts: ResolveOptions = {},
): Promise<string[]> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const results = await Promise.all([
    resolveViaDoh(GOOGLE_DNS, name, type, timeoutMs),
    resolveViaDoh(CLOUDFLARE_DNS, name, type, timeoutMs),
    withTimeout(resolveViaLocal(name, type), timeoutMs, type).catch(() => []),
  ]);
  return [...new Set(results.flat())];
}

/**
 * Resolve a hostname to one or more IP addresses (follows CNAMEs via
 * the OS resolver). Used by preflight to compare a custom domain
 * against the configured server's IP.
 */
export async function lookupAddresses(
  hostname: string,
  opts: ResolveOptions = {},
): Promise<string[]> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const result = await withTimeout(
      dns.lookup(hostname, { all: true }),
      timeoutMs,
      "lookup",
    );
    return result.map((entry) => entry.address);
  } catch {
    return [];
  }
}
