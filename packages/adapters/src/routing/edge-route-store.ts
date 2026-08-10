import { normalizeHostname, parseEdgeRoute, type EdgeRoute } from "@repo/core/managed-routing";

export interface EdgeRouteStore {
  get(hostname: string): Promise<EdgeRoute | null>;
  publish(hostname: string, route: EdgeRoute): Promise<void>;
  disable(hostname: string, version: number): Promise<void>;
  remove(hostname: string, version: number): Promise<void>;
}

export class StaleEdgeRouteWriteError extends Error {}

export class MemoryEdgeRouteStore implements EdgeRouteStore {
  private readonly routes = new Map<string, EdgeRoute>();
  private readonly tombstones = new Map<string, number>();

  async get(hostname: string): Promise<EdgeRoute | null> {
    return this.routes.get(normalizeHostname(hostname)) ?? null;
  }

  async publish(hostname: string, value: EdgeRoute): Promise<void> {
    const key = normalizeHostname(hostname);
    const route = parseEdgeRoute(value);
    const currentVersion = Math.max(this.routes.get(key)?.version ?? 0, this.tombstones.get(key) ?? 0);
    if (route.version < currentVersion) throw new StaleEdgeRouteWriteError(`Route version ${route.version} is older than ${currentVersion}`);
    this.routes.set(key, route);
    this.tombstones.delete(key);
  }

  async disable(hostname: string, version: number): Promise<void> {
    const key = normalizeHostname(hostname);
    const current = this.routes.get(key);
    if (!current) { this.tombstones.set(key, Math.max(version, this.tombstones.get(key) ?? 0)); return; }
    await this.publish(key, { ...current, enabled: false, version, updated_at: new Date().toISOString() });
  }

  async remove(hostname: string, version: number): Promise<void> {
    const key = normalizeHostname(hostname);
    const currentVersion = Math.max(this.routes.get(key)?.version ?? 0, this.tombstones.get(key) ?? 0);
    if (version < currentVersion) throw new StaleEdgeRouteWriteError(`Route version ${version} is older than ${currentVersion}`);
    this.routes.delete(key);
    this.tombstones.set(key, version);
  }
}

export type CloudflareKvOptions = { accountId: string; namespaceId: string; apiToken: string; fetch?: typeof fetch };

export class CloudflareKvEdgeRouteStore implements EdgeRouteStore {
  private readonly request: typeof fetch;
  constructor(private readonly options: CloudflareKvOptions) { this.request = options.fetch ?? fetch; }
  private url(hostname: string) {
    return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.options.accountId)}/storage/kv/namespaces/${encodeURIComponent(this.options.namespaceId)}/values/${encodeURIComponent(`route:${normalizeHostname(hostname)}`)}`;
  }
  private async call(hostname: string, init?: RequestInit, allowNotFound = false): Promise<Response> {
    const response = await this.request(this.url(hostname), { ...init, headers: { Authorization: `Bearer ${this.options.apiToken}`, ...(init?.headers ?? {}) } });
    if (!response.ok && !(allowNotFound && response.status === 404)) throw new Error(`Cloudflare KV request failed (${response.status})`);
    return response;
  }
  async get(hostname: string): Promise<EdgeRoute | null> {
    const response = await this.call(hostname, undefined, true);
    if (response.status === 404) return null;
    return parseEdgeRoute(await response.json());
  }
  async publish(hostname: string, value: EdgeRoute): Promise<void> {
    const route = parseEdgeRoute(value);
    const current = await this.get(hostname);
    if (current && route.version < current.version) throw new StaleEdgeRouteWriteError(`Route version ${route.version} is older than ${current.version}`);
    await this.call(hostname, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(route) });
  }
  async disable(hostname: string, version: number): Promise<void> {
    const current = await this.get(hostname);
    if (!current) return;
    await this.publish(hostname, { ...current, enabled: false, version, updated_at: new Date().toISOString() });
  }
  async remove(hostname: string, version: number): Promise<void> {
    const current = await this.get(hostname);
    if (current && version < current.version) throw new StaleEdgeRouteWriteError(`Route version ${version} is older than ${current.version}`);
    await this.call(hostname, { method: "DELETE" });
  }
}
