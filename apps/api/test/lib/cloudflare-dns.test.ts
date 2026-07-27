import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/env", () => ({
  env: {
    VIBRAIL_MANAGED_DOMAIN: "vibrail.warpgateapi.com",
    VIBRAIL_CLOUDFLARE_API_TOKEN: "backend-only-token",
    VIBRAIL_CLOUDFLARE_ZONE_ID: "zone-1",
    VIBRAIL_CLOUDFLARE_PROXY: true,
  },
}));

vi.mock("../../src/lib/edge-target", () => ({
  isNonPublicHost: () => false,
  resolveEdgeTargetHost: vi.fn(async () => ({ host: "203.0.113.10" })),
}));

import { deleteVibrailDnsRecord, upsertVibrailDnsRecord } from "../../src/lib/cloudflare-dns";

afterEach(() => vi.unstubAllGlobals());

function response(result: unknown) {
  return new Response(JSON.stringify({ success: true, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Vibrail Cloudflare DNS", () => {
  it("creates a proxied A record when none exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ id: "dns-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      upsertVibrailDnsRecord({
        hostname: "demo-oo198w.vibrail.warpgateapi.com",
        organizationId: "org-1",
        serverId: "server-1",
      }),
    ).resolves.toBe("created");

    const create = fetchMock.mock.calls[1]!;
    expect(create[0]).toContain("/zones/zone-1/dns_records");
    expect(create[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(create[1].body)).toMatchObject({
      type: "A",
      content: "203.0.113.10",
      proxied: true,
    });
  });

  it("updates an existing record instead of creating a duplicate", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([{ id: "dns-1", name: "demo", type: "A" }]))
      .mockResolvedValueOnce(response({ id: "dns-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      upsertVibrailDnsRecord({
        hostname: "demo-oo198w.vibrail.warpgateapi.com",
        organizationId: "org-1",
      }),
    ).resolves.toBe("updated");
    expect(fetchMock.mock.calls[1]![0]).toContain("/dns_records/dns-1");
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: "PUT" });
  });

  it("deletes exact-name records idempotently", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([{ id: "dns-1" }, { id: "dns-2" }]))
      .mockImplementation(async () => response({ id: "deleted" }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteVibrailDnsRecord("demo-oo198w.vibrail.warpgateapi.com");
    expect(fetchMock.mock.calls.slice(1).map((call) => call[0])).toEqual([
      expect.stringContaining("/dns_records/dns-1"),
      expect.stringContaining("/dns_records/dns-2"),
    ]);
  });
});
