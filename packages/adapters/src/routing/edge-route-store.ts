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
    const currentVersion = this.routes.get(key)?.version ?? 0;
    const tombstoneVersion = this.tombstones.get(key) ?? 0;
    if (route.version < currentVersion || (tombstoneVersion > 0 && route.version <= tombstoneVersion)) {
      throw new StaleEdgeRouteWriteError(`Route version ${route.version} does not supersede ${Math.max(currentVersion, tombstoneVersion)}`);
    }
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
  private url(key: string) {
    return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.options.accountId)}/storage/kv/namespaces/${encodeURIComponent(this.options.namespaceId)}/values/${encodeURIComponent(key)}`;
  }
  private routeKey(hostname: string): string { return `route:${normalizeHostname(hostname)}`; }
  private tombstoneKey(hostname: string): string { return `route-tombstone:${normalizeHostname(hostname)}`; }
  private async callKey(key: string, init?: RequestInit, allowNotFound = false): Promise<Response> {
    const response = await this.request(this.url(key), { ...init, headers: { Authorization: `Bearer ${this.options.apiToken}`, ...(init?.headers ?? {}) } });
    if (!response.ok && !(allowNotFound && response.status === 404)) throw new Error(`Cloudflare KV request failed (${response.status})`);
    return response;
  }
  private async tombstoneVersion(hostname: string): Promise<number> {
    const response = await this.callKey(this.tombstoneKey(hostname), undefined, true);
    if (response.status === 404) return 0;
    const value = await response.json() as unknown;
    if (!value || typeof value !== "object" || !Number.isSafeInteger((value as { version?: unknown }).version)) {
      throw new Error("Invalid Cloudflare KV route tombstone");
    }
    return (value as { version: number }).version;
  }
  async get(hostname: string): Promise<EdgeRoute | null> {
    const response = await this.callKey(this.routeKey(hostname), undefined, true);
    if (response.status === 404) return null;
    return parseEdgeRoute(await response.json());
  }
  async publish(hostname: string, value: EdgeRoute): Promise<void> {
    const route = parseEdgeRoute(value);
    const [current, tombstone] = await Promise.all([this.get(hostname), this.tombstoneVersion(hostname)]);
    const currentVersion = Math.max(current?.version ?? 0, tombstone);
    if (route.version < (current?.version ?? 0) || (tombstone > 0 && route.version <= tombstone)) {
      throw new StaleEdgeRouteWriteError(`Route version ${route.version} does not supersede ${currentVersion}`);
    }
    await this.callKey(this.routeKey(hostname), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(route) });
    if (tombstone > 0) await this.callKey(this.tombstoneKey(hostname), { method: "DELETE" });
  }
  async disable(hostname: string, version: number): Promise<void> {
    const current = await this.get(hostname);
    if (!current) {
      const tombstone = await this.tombstoneVersion(hostname);
      if (version < tombstone) throw new StaleEdgeRouteWriteError(`Route version ${version} is older than ${tombstone}`);
      await this.callKey(this.tombstoneKey(hostname), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ version }) });
      return;
    }
    await this.publish(hostname, { ...current, enabled: false, version, updated_at: new Date().toISOString() });
  }
  async remove(hostname: string, version: number): Promise<void> {
    const [current, tombstone] = await Promise.all([this.get(hostname), this.tombstoneVersion(hostname)]);
    const currentVersion = Math.max(current?.version ?? 0, tombstone);
    if (version < currentVersion) throw new StaleEdgeRouteWriteError(`Route version ${version} is older than ${currentVersion}`);
    // Persist the monotonic version before removing the route. This prevents a
    // delayed pre-delete job from resurrecting a hostname after cleanup.
    await this.callKey(this.tombstoneKey(hostname), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ version }) });
    if (current) await this.callKey(this.routeKey(hostname), { method: "DELETE" });
  }
}
