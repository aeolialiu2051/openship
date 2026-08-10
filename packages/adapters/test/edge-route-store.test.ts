import { describe, expect, it, vi } from "vitest";
import { CloudflareKvEdgeRouteStore, MemoryEdgeRouteStore, StaleEdgeRouteWriteError } from "../src/routing/edge-route-store";

const route = { project_id: "p", service_id: null, server_id: "001", enabled: true, version: 2, updated_at: new Date().toISOString() };

describe("edge route stores", () => {
  it("publishes, disables and removes idempotently", async () => {
    const store = new MemoryEdgeRouteStore();
    await store.publish("APP.Example.com", route);
    await store.disable("app.example.com", 3);
    expect(await store.get("app.example.com")).toMatchObject({ enabled: false, version: 3 });
    await store.remove("app.example.com", 4);
    await store.remove("app.example.com", 4);
    expect(await store.get("app.example.com")).toBeNull();
  });
  it("rejects stale writes, including after deletion", async () => {
    const store = new MemoryEdgeRouteStore();
    await store.publish("app.example.com", route);
    await store.remove("app.example.com", 3);
    await expect(store.publish("app.example.com", { ...route, version: 2 })).rejects.toBeInstanceOf(StaleEdgeRouteWriteError);
  });
  it("uses normalized route keys and bearer auth for Cloudflare KV", async () => {
    const request = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "PUT" ? new Response(null, { status: 200 }) : new Response(JSON.stringify({ ...route, version: 1 }), { status: 200 }));
    const store = new CloudflareKvEdgeRouteStore({ accountId: "acct", namespaceId: "ns", apiToken: "token", fetch: request as typeof fetch });
    await store.publish("APP.Example.com.", route);
    expect(request.mock.calls[0][0]).toContain("route%3Aapp.example.com");
    expect((request.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe("Bearer token");
  });
  it("allows a missing key on reads but rejects 404 responses from writes", async () => {
    const request = vi.fn(async () => new Response(null, { status: 404 }));
    const store = new CloudflareKvEdgeRouteStore({ accountId: "acct", namespaceId: "ns", apiToken: "token", fetch: request as typeof fetch });

    expect(await store.get("app.example.com")).toBeNull();
    await expect(store.publish("app.example.com", route)).rejects.toThrow("Cloudflare KV request failed (404)");
  });
});
