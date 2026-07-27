import { afterEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  findDomain: vi.fn(),
  findDomainById: vi.fn(),
  findProject: vi.fn(),
  markDnsManaged: vi.fn(),
  markVerified: vi.fn(),
  updateSsl: vi.fn(),
  clearDnsManaged: vi.fn(),
}));

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

vi.mock("../../src/lib/encryption", () => ({
  decrypt: (value: string) => value.replace(/^encrypted:/, ""),
}));

vi.mock("@repo/db", () => ({
  repos: {
    domainSettings: { get: dbMocks.getSettings },
    domain: {
      findByHostname: dbMocks.findDomain,
      findById: dbMocks.findDomainById,
      markDnsManaged: dbMocks.markDnsManaged,
      markVerified: dbMocks.markVerified,
      updateSsl: dbMocks.updateSsl,
      clearDnsManaged: dbMocks.clearDnsManaged,
    },
    project: { findById: dbMocks.findProject },
  },
}));

import { deleteDeploymentDnsRecord, upsertDeploymentDnsRecord } from "../../src/lib/cloudflare-dns";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

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
      upsertDeploymentDnsRecord({
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
      upsertDeploymentDnsRecord({
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
      .mockResolvedValueOnce(
        response([
          { id: "dns-1", type: "A" },
          { id: "dns-2", type: "A" },
        ]),
      )
      .mockImplementation(async () => response({ id: "deleted" }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteDeploymentDnsRecord({
      hostname: "demo-oo198w.vibrail.warpgateapi.com",
      organizationId: "org-1",
    });
    expect(fetchMock.mock.calls.slice(1).map((call) => call[0])).toEqual([
      expect.stringContaining("/dns_records/dns-1"),
      expect.stringContaining("/dns_records/dns-2"),
    ]);
  });

  it("uses the organization's Cloudflare zone for a matching custom domain", async () => {
    dbMocks.getSettings.mockResolvedValue({
      domain: "example.com",
      cloudflareZoneId: "customer-zone",
      cloudflareApiTokenEncrypted: "encrypted:customer-token",
      cloudflareProxy: false,
    });
    dbMocks.findDomain.mockResolvedValue({
      id: "dom-1",
      projectId: "project-1",
      verified: false,
      sslStatus: "none",
    });
    dbMocks.findDomainById.mockResolvedValue({ id: "dom-1", projectId: "project-1" });
    dbMocks.findProject.mockResolvedValue({ id: "project-1", organizationId: "org-1" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ id: "custom-record" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      upsertDeploymentDnsRecord({
        hostname: "app.example.com",
        organizationId: "org-1",
      }),
    ).resolves.toBe("created");

    expect(fetchMock.mock.calls[1]![0]).toContain("/zones/customer-zone/dns_records");
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toMatchObject({ proxied: false });
    expect(dbMocks.markDnsManaged).toHaveBeenCalledWith("dom-1", "cloudflare", "custom-record");
  });

  it("leaves unmatched custom domains for manual DNS", async () => {
    dbMocks.getSettings.mockResolvedValue({
      domain: "example.com",
      cloudflareZoneId: "customer-zone",
      cloudflareApiTokenEncrypted: "encrypted:customer-token",
      cloudflareProxy: true,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      upsertDeploymentDnsRecord({
        hostname: "app.other.test",
        organizationId: "org-1",
      }),
    ).resolves.toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes a custom record only after Vibrail marked it as managed", async () => {
    dbMocks.findDomain.mockResolvedValue({
      id: "dom-1",
      projectId: "project-1",
      dnsManaged: true,
      dnsProvider: "cloudflare",
      dnsRecordId: "custom-record",
    });
    dbMocks.findDomainById.mockResolvedValue({ id: "dom-1", projectId: "project-1" });
    dbMocks.findProject.mockResolvedValue({ id: "project-1", organizationId: "org-1" });
    dbMocks.getSettings.mockResolvedValue({
      domain: "example.com",
      cloudflareZoneId: "customer-zone",
      cloudflareApiTokenEncrypted: "encrypted:customer-token",
      cloudflareProxy: true,
    });
    const fetchMock = vi.fn().mockResolvedValue(response({ id: "custom-record" }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteDeploymentDnsRecord({
      hostname: "app.example.com",
      organizationId: "org-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/zones/customer-zone/dns_records/custom-record"),
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(dbMocks.clearDnsManaged).toHaveBeenCalledWith("dom-1");
  });
});
