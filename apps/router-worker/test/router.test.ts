import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRouteMemoryForTest, routeMemorySizeForTest, routeRequest, type Env } from "../src/index";

const route = { project_id: "proj_1", service_id: "svc_1", server_id: "001", enabled: true, version: 3, updated_at: new Date().toISOString() };
const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;

describe("router worker", () => {
  beforeEach(() => {
    resetRouteMemoryForTest();
    vi.stubGlobal("caches", { default: { match: vi.fn(async () => undefined), put: vi.fn(async () => undefined) } });
  });

  it("fails closed for absent and reserved routes", async () => {
    const env = { ROUTING: { get: vi.fn(async () => null) }, VIBRAIL_ROUTER_MASTER_SECRET: "secret" } as unknown as Env;
    const missing = await routeRequest(new Request("https://missing.vibrail.app"), env, ctx);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("x-vibrail-route-status")).toBe("miss");
    expect((await routeRequest(new Request("https://server-001.vibrail.app"), env, ctx)).status).toBe(404);
    expect((await routeRequest(new Request("https://nested.app.vibrail.app"), env, ctx)).status).toBe(404);
  });

  it("derives the origin, strips forged headers and does not follow redirects", async () => {
    const env = { ROUTING: { get: vi.fn(async () => route) }, VIBRAIL_ROUTER_MASTER_SECRET: "master" } as unknown as Env;
    const fetchMock = vi.fn(async (_url: URL, init: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await routeRequest(new Request("https://app-k3m9x2ab.vibrail.app/upload?q=1", { method: "POST", body: "stream", headers: { "x-vibrail-project-id": "forged" } }), env, ctx);
    expect(response.status).toBe(204);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.hostname).toBe("server-001.vibrail.app");
    expect(url.port).toBe("");
    expect(init.redirect).toBe("manual");
    expect((init.headers as Headers).get("x-vibrail-project-id")).toBe("proj_1");
    expect((init.headers as Headers).get("x-vibrail-signature")).toMatch(/^[a-f0-9]{64}$/);
    expect(response.headers.get("x-vibrail-route-status")).toBe("hit");
    expect(response.headers.get("x-vibrail-route-version")).toBe("3");
  });

  it("rejects a KV URL masquerading as server_id", async () => {
    const env = { ROUTING: { get: vi.fn(async () => ({ ...route, server_id: "https://evil.test" })) }, VIBRAIL_ROUTER_MASTER_SECRET: "master" } as unknown as Env;
    expect((await routeRequest(new Request("https://invalid-k3m9x2ab.vibrail.app"), env, ctx)).status).toBe(502);
  });

  it("bounds negative in-isolate caching under random-host scans", async () => {
    const env = { ROUTING: { get: vi.fn(async () => null) }, VIBRAIL_ROUTER_MASTER_SECRET: "master" } as unknown as Env;
    for (let index = 0; index < 1_100; index += 1) {
      await routeRequest(new Request(`https://scan-${index}.vibrail.app`), env, ctx);
    }
    expect(routeMemorySizeForTest()).toBe(1_024);
  });

  it("preserves the runtime-owned WebSocket upgrade response", async () => {
    const env = { ROUTING: { get: vi.fn(async () => route) }, VIBRAIL_ROUTER_MASTER_SECRET: "master" } as unknown as Env;
    const upgrade = { status: 101, webSocket: {} } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn(async () => upgrade));
    const response = await routeRequest(
      new Request("https://app-k3m9x2ab.vibrail.app/socket", { headers: { upgrade: "websocket" } }),
      env,
      ctx,
    );
    expect(response).toBe(upgrade);
  });
});
