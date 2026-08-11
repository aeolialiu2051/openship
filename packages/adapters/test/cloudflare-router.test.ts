import { describe, expect, it, vi } from "vitest";
import { CloudflareRouterInfra } from "../src/infra/cloudflare-router";

const envelope = (result: unknown) => new Response(JSON.stringify({ success: true, result }), { status: 200 });

describe("Cloudflare server origin provisioning", () => {
  it("creates one DNS-only origin record and an exact no-script exclusion", async () => {
    const request = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("dns_records?")) return envelope([]);
      if (url.endsWith("/dns_records")) return envelope({ id: "dns1" });
      if (url.endsWith("/workers/routes") && !init?.method) return envelope([]);
      if (url.endsWith("/workers/routes")) return envelope({ id: "route1", pattern: "server-001.vibrail.app/*", script: null });
      throw new Error(`Unexpected ${url}`);
    });
    const infra = new CloudflareRouterInfra({ zoneId: "zone", apiToken: "token", fetch: request as typeof fetch });
    expect(await infra.provisionServerOrigin({ routingId: "001", ipv4: "203.0.113.8" })).toEqual({ hostname: "server-001.vibrail.app", dnsRecordId: "dns1", exclusionRouteId: "route1" });
    const dnsBody = JSON.parse(String(request.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body));
    expect(dnsBody).toMatchObject({
      name: "server-001.vibrail.app",
      content: "203.0.113.8",
      proxied: false,
    });
    const routeCall = request.mock.calls.find(([url, init]) => String(url).endsWith("/workers/routes") && init?.method === "POST");
    expect(JSON.parse(String(routeCall?.[1]?.body))).toEqual({ pattern: "server-001.vibrail.app/*", script: null });
  });

  it("updates idempotently and removes only the exact server resources", async () => {
    const request = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("dns_records?")) return envelope([{ id: "dns1", name: "server-001.vibrail.app" }]);
      if (url.endsWith("/workers/routes") && !init?.method) return envelope([{ id: "r1", pattern: "server-001.vibrail.app/*", script: null }, { id: "wild", pattern: "*.vibrail.app/*", script: "vibrail-router" }]);
      return envelope({ id: url.endsWith("r1") ? "r1" : "dns1" });
    });
    const infra = new CloudflareRouterInfra({ zoneId: "zone", apiToken: "token", fetch: request as typeof fetch });
    await infra.provisionServerOrigin({ routingId: "001", ipv4: "203.0.113.9" });
    await infra.removeServerOrigin("001");
    expect(request.mock.calls.some(([url, init]) => String(url).endsWith("/workers/routes/wild") && init?.method === "DELETE")).toBe(false);
    expect(request.mock.calls.some(([url, init]) => String(url).endsWith("/workers/routes/r1") && init?.method === "DELETE")).toBe(true);
  });

  it("rolls back a newly-created DNS record when exclusion provisioning fails", async () => {
    const request = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("dns_records?")) return envelope([]);
      if (url.endsWith("/dns_records") && init?.method === "POST") return envelope({ id: "dns-new" });
      if (url.endsWith("/workers/routes") && !init?.method) return new Response(JSON.stringify({ success: false, errors: [{ message: "denied" }] }), { status: 403 });
      if (url.endsWith("/dns_records/dns-new") && init?.method === "DELETE") return envelope({ id: "dns-new" });
      throw new Error(`Unexpected ${url}`);
    });
    const infra = new CloudflareRouterInfra({ zoneId: "zone", apiToken: "token", fetch: request as typeof fetch });
    await expect(infra.provisionServerOrigin({ routingId: "001", ipv4: "203.0.113.9" })).rejects.toThrow(/403/);
    expect(request).toHaveBeenCalledWith(expect.stringContaining("/dns_records/dns-new"), expect.objectContaining({ method: "DELETE" }));
  });

  it("restores a pre-existing DNS record when exclusion provisioning fails", async () => {
    const original = { id: "dns1", type: "A", name: "server-001.vibrail.app", content: "192.0.2.10", ttl: 300, proxied: false, comment: "operator record" };
    let dnsPutCount = 0;
    const request = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("dns_records?")) return envelope([original]);
      if (url.endsWith("/dns_records/dns1") && init?.method === "PUT") {
        dnsPutCount += 1;
        return envelope({ ...original, ...(JSON.parse(String(init.body)) as object) });
      }
      if (url.endsWith("/workers/routes") && !init?.method) {
        return new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: "denied" }] }), { status: 403 });
      }
      throw new Error(`Unexpected ${url}`);
    });
    const infra = new CloudflareRouterInfra({ zoneId: "zone", apiToken: "token", fetch: request as typeof fetch });
    await expect(infra.provisionServerOrigin({ routingId: "001", ipv4: "203.0.113.9" })).rejects.toThrow("10000: denied");
    expect(dnsPutCount).toBe(2);
    const restoreCall = request.mock.calls.filter(([url, init]) => String(url).endsWith("/dns_records/dns1") && init?.method === "PUT").at(-1);
    expect(JSON.parse(String(restoreCall?.[1]?.body))).toEqual({ type: "A", name: original.name, content: original.content, ttl: 300, proxied: false, comment: "operator record" });
  });
});
