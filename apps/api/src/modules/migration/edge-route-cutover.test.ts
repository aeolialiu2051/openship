import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryEdgeRouteStore } from "@repo/adapters";

let version = 3;
const domain = { id: "d1", projectId: "p1", serviceId: null, hostname: "app-k3m9x2ab.vibrail.app", domainType: "free", routeVersion: 3 };
vi.mock("@repo/db", () => ({ repos: { domain: {
  nextRouteVersion: vi.fn(async () => ++version),
  updateRouteState: vi.fn(async () => true),
  findById: vi.fn(async () => domain),
} } }));

import { cutoverManagedRoutes } from "./edge-route-cutover";

describe("managed route migration cutover", () => {
  beforeEach(() => { version = 3; });
  it("publishes the healthy target with a higher version", async () => {
    const store = new MemoryEdgeRouteStore();
    const order: string[] = [];
    const publishing = { ...store, get: store.get.bind(store), publish: vi.fn(async (hostname: string, route: any) => { order.push(`kv:${route.version}`); return store.publish(hostname, route); }), disable: store.disable.bind(store), remove: store.remove.bind(store) };
    const result = await cutoverManagedRoutes({ domains: [domain as never], sourceRoutingId: "001", targetRoutingId: "002", store: publishing, beforeTargetPublish: async (_domain, version) => { order.push(`authority:${version}`); } });
    expect(result.switched[0]?.version).toBe(4);
    expect(await store.get(domain.hostname)).toMatchObject({ server_id: "002", version: 4 });
    expect(order).toEqual(["authority:4", "kv:4"]);
  });
  it("rolls already switched routes forward to source when a later write fails", async () => {
    const store = new MemoryEdgeRouteStore();
    const failing = { ...store, get: store.get.bind(store), publish: vi.fn(async (hostname: string, route: any) => {
      if (hostname.startsWith("second") && route.server_id === "002") throw new Error("KV unavailable");
      return store.publish(hostname, route);
    }), disable: store.disable.bind(store), remove: store.remove.bind(store) };
    const second = { ...domain, id: "d2", hostname: "second-k3m9x2ab.vibrail.app" };
    const cleanup = vi.fn(async () => undefined);
    await expect(cutoverManagedRoutes({ domains: [domain as never, second as never], sourceRoutingId: "001", targetRoutingId: "002", store: failing, afterRollbackRetention: cleanup, rollbackRetentionMs: 0 })).rejects.toThrow("KV unavailable");
    expect(await store.get(domain.hostname)).toMatchObject({ server_id: "001", version: 6 });
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});
