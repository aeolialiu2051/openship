import { describe, expect, it, vi } from "vitest";
import { MemoryEdgeRouteStore } from "@repo/adapters";
import { reconcileDomainProjection } from "./edge-route-reconcile.service";
import type { Domain } from "@repo/db";

const domain = { id: "d", hostname: "app-k3m9x2ab.vibrail.app", projectId: "p", serviceId: null, domainType: "free", routeStatus: "active", routeVersion: 3, updatedAt: new Date() } as Domain;

describe("edge route reconciler", () => {
  it("repairs a missing route and is idempotent", async () => { const store = new MemoryEdgeRouteStore(); expect(await reconcileDomainProjection(domain, "001", store)).toBe("published"); expect(await reconcileDomainProjection(domain, "001", store)).toBe("unchanged"); });
  it("repairs a stale or wrong server projection", async () => { const store = new MemoryEdgeRouteStore(); await store.publish(domain.hostname, { project_id: "p", service_id: null, server_id: "002", enabled: true, version: 2, updated_at: new Date().toISOString() }); expect(await reconcileDomainProjection(domain, "001", store)).toBe("published"); expect((await store.get(domain.hostname))?.server_id).toBe("001"); });
  it("disables before teardown", async () => { const store = new MemoryEdgeRouteStore(); await store.publish(domain.hostname, { project_id: "p", service_id: null, server_id: "001", enabled: true, version: 3, updated_at: new Date().toISOString() }); expect(await reconcileDomainProjection({ ...domain, routeStatus: "disabled" }, "001", store)).toBe("disabled"); expect((await store.get(domain.hostname))?.enabled).toBe(false); });
  it("repairs authority even when KV is already current", async () => {
    const store = new MemoryEdgeRouteStore();
    await store.publish(domain.hostname, { project_id: "p", service_id: null, server_id: "001", enabled: true, version: 3, updated_at: new Date().toISOString() });
    const ensureAuthority = vi.fn(async () => undefined);
    expect(await reconcileDomainProjection(domain, "001", store, { ensureAuthority })).toBe("unchanged");
    expect(ensureAuthority).toHaveBeenCalledOnce();
  });
  it("alerts without touching authority when an unknown higher version exists", async () => {
    const store = new MemoryEdgeRouteStore();
    await store.publish(domain.hostname, { project_id: "p", service_id: null, server_id: "001", enabled: true, version: 4, updated_at: new Date().toISOString() });
    const ensureAuthority = vi.fn(async () => undefined);
    expect(await reconcileDomainProjection(domain, "001", store, { ensureAuthority })).toBe("ahead");
    expect(ensureAuthority).not.toHaveBeenCalled();
  });
});
