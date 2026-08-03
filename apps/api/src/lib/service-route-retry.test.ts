import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listServices: vi.fn(),
  updateService: vi.fn(),
  listLive: vi.fn(),
  listDomains: vi.fn(),
  buildRoutes: vi.fn(),
  syncDns: vi.fn(),
  waitForDns: vi.fn(),
  reconcile: vi.fn(),
  recreateDockerServices: vi.fn(),
  inherit: vi.fn(),
}));

vi.mock("@repo/db", () => ({
  repos: {
    service: {
      listByProject: mocks.listServices,
      update: mocks.updateService,
      listByDeployment: mocks.listLive,
    },
    domain: { listByProject: mocks.listDomains },
  },
}));

vi.mock("./routing-domains", () => ({
  buildServiceRouteDomains: mocks.buildRoutes,
}));

vi.mock("./service-route-dns", () => ({
  syncServiceRouteDns: mocks.syncDns,
}));

vi.mock("./cloudflare-dns", () => ({
  waitForDeploymentDnsPropagation: mocks.waitForDns,
}));

vi.mock("./route-apply.service", () => ({
  reconcileProjectRoutes: mocks.reconcile,
}));

vi.mock("./public-endpoints", () => ({
  inheritSoleProjectRouteForService: mocks.inherit,
}));

import { retryProjectServiceRoutes } from "./service-route-retry";

describe("retryProjectServiceRoutes", () => {
  const project = {
    id: "proj_1",
    organizationId: "org_1",
    slug: "api",
    routeStrategy: "auto",
  } as any;
  const deployment = { id: "dep_1", organizationId: "org_1", meta: {} } as any;
  const service = {
    id: "svc_1",
    name: "api",
    enabled: true,
    exposed: true,
  } as any;
  const route = {
    hostname: "api-abc.vibrail.warpgateapi.com",
    targetPort: 8317,
    domainType: "free",
  } as any;

  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.listServices.mockResolvedValue([service]);
    mocks.listDomains.mockResolvedValue([]);
    mocks.listLive.mockResolvedValue([{ serviceId: "svc_1", ip: "172.20.0.2", hostPort: 18317 }]);
    mocks.inherit.mockReturnValue(null);
    mocks.buildRoutes.mockReturnValue([route]);
    mocks.syncDns.mockResolvedValue({ publishableRoutes: [route], failures: [] });
    mocks.waitForDns.mockResolvedValue(true);
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.recreateDockerServices.mockResolvedValue(undefined);
  });

  it("rebuilds DNS and refreshes Docker labels without rebuilding the image", async () => {
    const result = await retryProjectServiceRoutes({
      project,
      deployment,
      runtime: { name: "docker" } as any,
      routing: {} as any,
      usesManagedRouting: true,
      serverId: "server_1",
      recreateDockerServices: mocks.recreateDockerServices,
    });

    expect(result.failures).toEqual([]);
    expect(mocks.syncDns).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj_1", serverId: "server_1" }),
    );
    expect(mocks.waitForDns).toHaveBeenCalledWith(route.hostname, {
      attempts: 60,
      intervalMs: 1_000,
      deadlineMs: 60_000,
    });
    expect(mocks.recreateDockerServices).toHaveBeenCalledWith(["svc_1"]);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("does not report Docker repair success when no label refresh is available", async () => {
    const result = await retryProjectServiceRoutes({
      project,
      deployment,
      runtime: { name: "docker" } as any,
      routing: {} as any,
      usesManagedRouting: true,
      serverId: "server_1",
    });

    expect(result.failures).toEqual([
      {
        hostname: route.hostname,
        message: "Docker route repair could not refresh the container labels",
      },
    ]);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("keeps live registerRoute repair for non-Docker routing providers", async () => {
    const result = await retryProjectServiceRoutes({
      project,
      deployment,
      runtime: { name: "bare" } as any,
      routing: {} as any,
      usesManagedRouting: true,
      serverId: "server_1",
    });

    expect(result.failures).toEqual([]);
    expect(mocks.reconcile).toHaveBeenCalledWith(
      project,
      expect.objectContaining({
        strict: true,
        registers: [
          expect.objectContaining({
            hostname: route.hostname,
            targetUrl: "http://127.0.0.1:18317",
          }),
        ],
      }),
    );
  });

  it("keeps Action Required when DNS is still not resolvable", async () => {
    mocks.waitForDns.mockResolvedValue(false);

    const result = await retryProjectServiceRoutes({
      project,
      deployment,
      runtime: { name: "docker" } as any,
      routing: {} as any,
      usesManagedRouting: true,
      serverId: "server_1",
    });

    expect(result.failures).toEqual([
      { hostname: route.hostname, message: "DNS is still not publicly resolvable" },
    ]);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("checks multiple domain propagation windows concurrently", async () => {
    const secondRoute = {
      ...route,
      hostname: "api-secondary-abc.vibrail.warpgateapi.com",
      targetPort: 8318,
    };
    const resolvers: Array<(value: boolean) => void> = [];
    mocks.buildRoutes.mockReturnValue([route, secondRoute]);
    mocks.syncDns.mockResolvedValue({ publishableRoutes: [route, secondRoute], failures: [] });
    mocks.waitForDns.mockImplementation(
      () => new Promise<boolean>((resolve) => resolvers.push(resolve)),
    );

    const retry = retryProjectServiceRoutes({
      project,
      deployment,
      runtime: { name: "docker" } as any,
      routing: {} as any,
      usesManagedRouting: true,
      serverId: "server_1",
      recreateDockerServices: mocks.recreateDockerServices,
    });

    await vi.waitFor(() => expect(mocks.waitForDns).toHaveBeenCalledTimes(2));
    for (const resolve of resolvers) resolve(true);

    expect((await retry).failures).toEqual([]);
  });
});
