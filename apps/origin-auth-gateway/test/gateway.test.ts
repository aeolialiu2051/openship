import { describe, expect, it, vi } from "vitest";
import { MemoryNonceStore, deriveServerSecret, gatewayRequest, signRoute, verifyOriginRequest, type GatewayConfig } from "../src/index";
import { routeSignaturePayload } from "@repo/core/managed-routing";

const master = "master-secret";
const serverSecret = deriveServerSecret(master, "001");
const authority = { isCurrent: async (route: { projectId: string }) => route.projectId === "proj_1" };

function signedRequest(overrides: Record<string, string> = {}) {
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const values = { method: "POST", hostname: "app-k3m9x2ab.vibrail.app", pathAndQuery: "/upload?q=1", projectId: "proj_1", serviceId: "svc_1", serverId: "001", routeVersion: 3, timestamp, nonce: crypto.randomUUID() };
  const headers = new Headers({
    "x-vibrail-hostname": values.hostname, "x-vibrail-project-id": values.projectId,
    "x-vibrail-service-id": values.serviceId, "x-vibrail-server-id": values.serverId,
    "x-vibrail-route-version": String(values.routeVersion), "x-vibrail-timestamp": values.timestamp,
    "x-vibrail-nonce": values.nonce,
    "x-vibrail-signature": signRoute(serverSecret, routeSignaturePayload(values)),
    ...overrides,
  });
  return new Request("https://server-001.vibrail.app/upload?q=1", { method: "POST", body: "stream", headers });
}

function config(): GatewayConfig { return { serverId: "001", currentServerSecret: serverSecret, nonceStore: new MemoryNonceStore(), authority }; }

describe("origin authentication", () => {
  it("accepts a current signed deployment", async () => expect((await verifyOriginRequest(signedRequest(), config())).ok).toBe(true));
  it("rejects tampering", async () => expect(await verifyOriginRequest(signedRequest({ "x-vibrail-project-id": "proj_2" }), config())).toEqual({ ok: false, status: 403 }));
  it("rejects expired timestamps", async () => expect((await verifyOriginRequest(signedRequest({ "x-vibrail-timestamp": "1" }), config())).ok).toBe(false));
  it("rejects nonce replay", async () => { const cfg = config(); const req = signedRequest(); expect((await verifyOriginRequest(req.clone(), cfg)).ok).toBe(true); expect(await verifyOriginRequest(req, cfg)).toEqual({ ok: false, status: 403 }); });
  it("hides a server mismatch", async () => expect(await verifyOriginRequest(signedRequest({ "x-vibrail-server-id": "002" }), config())).toEqual({ ok: false, status: 404 }));
  it("accepts the previous key during rotation", async () => { const cfg = { ...config(), currentServerSecret: "new-secret", previousServerSecret: serverSecret }; expect((await verifyOriginRequest(signedRequest(), cfg)).ok).toBe(true); });
  it("streams uploads to loopback Traefik with a trusted Host and no internal headers", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    expect((await gatewayRequest(signedRequest(), config())).status).toBe(200);
    const [target, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit & { duplex?: string }];
    expect(target.href).toBe("http://127.0.0.1:8080/upload?q=1");
    expect(init.duplex).toBe("half");
    expect((init.headers as Headers).get("host")).toBe("app-k3m9x2ab.vibrail.app");
    expect((init.headers as Headers).get("x-vibrail-signature")).toBeNull();
  });
});
