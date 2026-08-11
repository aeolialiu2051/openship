import { originHostnameForServer } from "@repo/core/managed-routing";

type CfEnvelope<T> = { success: boolean; result: T; errors?: Array<{ code?: number; message?: string }> };
type DnsRecord = { id: string; name: string; type: string; content: string; proxied: boolean; ttl?: number; comment?: string | null };
type WorkerRoute = { id: string; pattern: string; script?: string | null };

export type CloudflareRouterInfraOptions = { zoneId: string; apiToken: string; baseDomain?: string; fetch?: typeof fetch };

export class CloudflareRouterInfra {
  private readonly request: typeof fetch;
  constructor(private readonly options: CloudflareRouterInfraOptions) { this.request = options.fetch ?? fetch; }
  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.request(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(this.options.zoneId)}${path}`, { ...init, headers: { Authorization: `Bearer ${this.options.apiToken}`, "content-type": "application/json", ...(init?.headers ?? {}) } });
    const body = await response.json().catch(() => null) as CfEnvelope<T> | null;
    if (!response.ok || !body?.success) {
      const details = body?.errors
        ?.map((item) => [item.code, item.message].filter((value) => value != null && value !== "").join(": "))
        .filter(Boolean)
        .join("; ");
      throw new Error(`Cloudflare router infrastructure request failed (${response.status})${details ? `: ${details}` : ""}`);
    }
    return body.result;
  }

  async provisionServerOrigin(input: { routingId: string; ipv4: string }): Promise<{ hostname: string; dnsRecordId: string; exclusionRouteId: string }> {
    const hostname = originHostnameForServer(input.routingId, this.options.baseDomain);
    const records = await this.call<DnsRecord[]>(`/dns_records?type=A&name=${encodeURIComponent(hostname)}`);
    const existing = records[0];
    // This is the Router Worker's origin, not a public application hostname.
    // Keep it DNS-only so Traefik's HTTP-01 challenge reaches the server
    // directly. Proxying it through Cloudflare creates a bootstrap deadlock:
    // the origin has no trusted certificate yet, Strict mode returns 526, and
    // the proxied ACME challenge cannot issue the certificate needed to clear
    // that 526. Origin requests are authenticated independently by the
    // server-specific HMAC middleware.
    const desired = { type: "A", name: hostname, content: input.ipv4, ttl: 1, proxied: false, comment: "Vibrail server origin; DNS-only; do not remove while server is registered" };
    const dns = existing
      ? await this.call<DnsRecord>(`/dns_records/${encodeURIComponent(existing.id)}`, { method: "PUT", body: JSON.stringify(desired) })
      : await this.call<DnsRecord>("/dns_records", { method: "POST", body: JSON.stringify(desired) });

    // A route with no script is Cloudflare's documented exact-pattern
    // exclusion. Exact hostname specificity wins over *.vibrail.app/*.
    const pattern = `${hostname}/*`;
    try {
      const routes = await this.call<WorkerRoute[]>("/workers/routes");
      const found = routes.find((route) => route.pattern.toLowerCase() === pattern);
      const exclusion = found ?? await this.call<WorkerRoute>("/workers/routes", { method: "POST", body: JSON.stringify({ pattern, script: null }) });
      if (found?.script) await this.call<WorkerRoute>(`/workers/routes/${encodeURIComponent(found.id)}`, { method: "PUT", body: JSON.stringify({ pattern, script: null }) });
      return { hostname, dnsRecordId: dns.id, exclusionRouteId: exclusion.id };
    } catch (error) {
      if (existing) {
        const restore = {
          type: existing.type,
          name: existing.name,
          content: existing.content,
          ttl: existing.ttl ?? 1,
          proxied: existing.proxied,
          ...(existing.comment != null ? { comment: existing.comment } : {}),
        };
        await this.call(`/dns_records/${encodeURIComponent(existing.id)}`, { method: "PUT", body: JSON.stringify(restore) }).catch(() => undefined);
      } else {
        await this.call(`/dns_records/${encodeURIComponent(dns.id)}`, { method: "DELETE" }).catch(() => undefined);
      }
      throw error;
    }
  }

  async removeServerOrigin(routingId: string): Promise<void> {
    const hostname = originHostnameForServer(routingId, this.options.baseDomain);
    const [records, routes] = await Promise.all([
      this.call<DnsRecord[]>(`/dns_records?type=A&name=${encodeURIComponent(hostname)}`),
      this.call<WorkerRoute[]>("/workers/routes"),
    ]);
    for (const route of routes.filter((item) => item.pattern.toLowerCase() === `${hostname}/*`)) await this.call(`/workers/routes/${encodeURIComponent(route.id)}`, { method: "DELETE" });
    for (const record of records) await this.call(`/dns_records/${encodeURIComponent(record.id)}`, { method: "DELETE" });
  }
}
