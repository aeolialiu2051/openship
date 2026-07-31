import { describe, expect, it, vi } from "vitest";
import type { Domain } from "@repo/db";
import type { PlannedRouteDomain } from "./routing-domains";
import { syncServiceRouteDns } from "./service-route-dns";

const freeRoute = (hostname = "api.vibrail.warpgateapi.com"): PlannedRouteDomain => ({
  hostname,
  tls: true,
  provisionSsl: false,
  isCloud: true,
  targetPort: 8000,
  domainType: "free",
  serviceId: "svc_1",
  createIfMissing: true,
  verified: true,
});

function dependencies() {
  return {
    ensureRouteDomainRecord: vi.fn().mockResolvedValue({ id: "dom_1" }),
    upsertDeploymentDnsRecord: vi.fn().mockResolvedValue("created" as const),
    deleteDeploymentDnsRecord: vi.fn().mockResolvedValue(undefined),
    isVibrailManagedHostname: vi.fn((hostname: string) =>
      hostname.endsWith(".vibrail.warpgateapi.com"),
    ),
  };
}

describe("syncServiceRouteDns", () => {
  it("writes Cloudflare DNS for a newly-public deployed service before returning it for publish", async () => {
    const deps = dependencies();
    const route = freeRoute("fastapi-template-zpfozy.vibrail.warpgateapi.com");

    const result = await syncServiceRouteDns(
      {
        projectId: "proj_1",
        organizationId: "org_1",
        serverId: "server_1",
        nextRoutes: [route],
        removedRoutes: [],
        domainByHostname: new Map<string, Domain>(),
      },
      deps,
    );

    expect(deps.ensureRouteDomainRecord).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj_1", route }),
    );
    expect(deps.upsertDeploymentDnsRecord).toHaveBeenCalledWith({
      hostname: route.hostname,
      organizationId: "org_1",
      serverId: "server_1",
    });
    expect(result.publishableRoutes).toEqual([route]);
    expect(result.failures).toEqual([]);
  });

  it("keeps a DNS-failed route out of the live publish set and reports the failure", async () => {
    const deps = dependencies();
    deps.upsertDeploymentDnsRecord.mockRejectedValue(new Error("Cloudflare unavailable"));
    const route = freeRoute();

    const result = await syncServiceRouteDns(
      {
        projectId: "proj_1",
        organizationId: "org_1",
        serverId: "server_1",
        nextRoutes: [route],
        removedRoutes: [],
        domainByHostname: new Map<string, Domain>(),
      },
      deps,
    );

    expect(result.publishableRoutes).toEqual([]);
    expect(result.failures).toEqual([
      expect.objectContaining({
        hostname: route.hostname,
        operation: "publish",
        message: "Cloudflare unavailable",
      }),
    ]);
  });

  it("deletes Cloudflare DNS for a removed free route", async () => {
    const deps = dependencies();
    const oldRoute = freeRoute("old-api.vibrail.warpgateapi.com");

    const result = await syncServiceRouteDns(
      {
        projectId: "proj_1",
        organizationId: "org_1",
        nextRoutes: [],
        removedRoutes: [oldRoute],
        domainByHostname: new Map<string, Domain>(),
      },
      deps,
    );

    expect(deps.deleteDeploymentDnsRecord).toHaveBeenCalledWith({
      hostname: oldRoute.hostname,
      organizationId: "org_1",
    });
    expect(result.failures).toEqual([]);
  });

  it("treats a skipped managed-domain write as an error", async () => {
    const deps = dependencies();
    deps.upsertDeploymentDnsRecord.mockResolvedValue("skipped");

    const result = await syncServiceRouteDns(
      {
        projectId: "proj_1",
        organizationId: "org_1",
        nextRoutes: [freeRoute()],
        removedRoutes: [],
        domainByHostname: new Map<string, Domain>(),
      },
      deps,
    );

    expect(result.publishableRoutes).toEqual([]);
    expect(result.failures[0]?.message).toContain("Managed DNS credentials are unavailable");
  });
});
