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

const pendingCustomRoute = (hostname = "api.example.com"): PlannedRouteDomain => ({
  hostname,
  tls: true,
  provisionSsl: false,
  isCloud: false,
  targetPort: 8000,
  domainType: "custom",
  serviceId: "svc_1",
  createIfMissing: true,
  verified: false,
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

  it("publishes a pending custom route after its connected Cloudflare zone writes DNS", async () => {
    const deps = dependencies();
    const route = pendingCustomRoute();

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

    expect(deps.upsertDeploymentDnsRecord).toHaveBeenCalledWith({
      hostname: route.hostname,
      organizationId: "org_1",
      serverId: "server_1",
    });
    expect(result.publishableRoutes).toEqual([{ ...route, verified: true }]);
    expect(result.failures).toEqual([]);
  });

  it("keeps a pending custom route manual when no connected zone covers it", async () => {
    const deps = dependencies();
    deps.upsertDeploymentDnsRecord.mockResolvedValue("skipped");
    const route = pendingCustomRoute("api.other.test");

    const result = await syncServiceRouteDns(
      {
        projectId: "proj_1",
        organizationId: "org_1",
        nextRoutes: [route],
        removedRoutes: [],
        domainByHostname: new Map<string, Domain>(),
      },
      deps,
    );

    expect(result.publishableRoutes).toEqual([]);
    expect(result.failures).toEqual([]);
  });

  it("does not replace DNS for a verified external-ingress custom route", async () => {
    const deps = dependencies();
    deps.ensureRouteDomainRecord.mockResolvedValue({
      id: "dom_external",
      externalIngress: true,
    });
    const route = { ...pendingCustomRoute("tunnel.example.com"), verified: true };

    const result = await syncServiceRouteDns(
      {
        projectId: "proj_1",
        organizationId: "org_1",
        nextRoutes: [route],
        removedRoutes: [],
        domainByHostname: new Map<string, Domain>(),
      },
      deps,
    );

    expect(deps.upsertDeploymentDnsRecord).not.toHaveBeenCalled();
    expect(result.publishableRoutes).toEqual([route]);
    expect(result.failures).toEqual([]);
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
