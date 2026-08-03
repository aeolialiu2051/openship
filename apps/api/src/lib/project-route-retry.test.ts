import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveRouteState: vi.fn(),
  buildRoutes: vi.fn(),
  syncDns: vi.fn(),
  waitForDns: vi.fn(),
  prepareTraefik: vi.fn(),
  attachNetworks: vi.fn(),
  decryptEnv: vi.fn(),
  setContainerId: vi.fn(),
  deploy: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("@repo/db", () => ({
  repos: { deployment: { setContainerId: mocks.setContainerId } },
}));

vi.mock("./routing-domains", () => ({
  buildProjectRouteDomains: mocks.buildRoutes,
  getRoutingBaseDomain: () => "vibrail.example.com",
  isRoutePublishable: () => true,
}));

vi.mock("./service-route-dns", () => ({ syncServiceRouteDns: mocks.syncDns }));
vi.mock("./cloudflare-dns", () => ({
  waitForDeploymentDnsPropagation: mocks.waitForDns,
}));
vi.mock("./traefik-routing", () => ({
  prepareTraefikConfig: mocks.prepareTraefik,
  vibrailRouterName: () => "router-1",
}));
vi.mock("./encryption", () => ({ decryptEnvMap: mocks.decryptEnv }));
vi.mock("./resources", () => ({
  withDefaults: () => ({ cpuCores: 1, memoryMb: 512, diskMb: 1024 }),
}));
vi.mock("../modules/domains/project-route.service", () => ({
  resolveProjectRouteState: mocks.resolveRouteState,
}));
vi.mock("../modules/deployments/attach-linked-networks", () => ({
  attachLinkedNetworks: mocks.attachNetworks,
}));
vi.mock("../modules/mail/webmail/webmail-persistence", () => ({
  managedWebmailBindMounts: () => undefined,
}));

import { retryProjectApplicationRoutes } from "./project-route-retry";

describe("retryProjectApplicationRoutes", () => {
  const project = {
    id: "proj_1",
    organizationId: "org_1",
    slug: "app",
    routeKey: "abc123",
    isApp: false,
    appTemplateId: null,
  } as any;
  const deployment = {
    id: "dep_1",
    organizationId: "org_1",
    environment: "production",
    imageRef: "vibrail/app:dep_1",
    containerId: "old-container",
    envVars: {},
    meta: {
      framework: "node",
      port: 3000,
      startCommand: "node server.js",
      hasServer: true,
      resources: null,
      outputDirectory: "",
      productionPaths: [],
    },
  } as any;
  const route = {
    hostname: "app-abc123.vibrail.example.com",
    targetPort: 3000,
    tls: true,
    domainType: "free",
    verified: true,
  } as any;
  const runtime = {
    name: "docker",
    deploy: mocks.deploy,
    destroy: mocks.destroy,
  } as any;

  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.resolveRouteState.mockResolvedValue({
      projectDomains: [],
      publicEndpoints: [
        {
          hostname: route.hostname,
          domain: "app-abc123",
          domainType: "free",
          port: 3000,
          isPrimary: true,
        },
      ],
      primarySlug: "app-abc123",
      primaryDomainType: "free",
    });
    mocks.buildRoutes.mockReturnValue([route]);
    mocks.syncDns.mockResolvedValue({ publishableRoutes: [route], failures: [] });
    mocks.waitForDns.mockResolvedValue(true);
    mocks.prepareTraefik.mockResolvedValue({
      network: "edge",
      entrypoint: "websecure",
      tls: true,
      routes: [{ hostname: route.hostname, port: 3000 }],
    });
    mocks.decryptEnv.mockReturnValue({ NODE_ENV: "production" });
    mocks.deploy.mockResolvedValue({ containerId: "new-container", status: "running" });
    mocks.destroy.mockResolvedValue(undefined);
    mocks.attachNetworks.mockResolvedValue(undefined);
    mocks.setContainerId.mockResolvedValue(undefined);
  });

  it("recreates a single-app Docker container from its existing image with repaired labels", async () => {
    const result = await retryProjectApplicationRoutes({
      project,
      deployment,
      runtime,
      usesManagedRouting: true,
      serverId: "server_1",
    });

    expect(result).toEqual({ failures: [], attemptedRoutes: 1 });
    expect(mocks.waitForDns).toHaveBeenCalledWith(route.hostname, {
      attempts: 60,
      intervalMs: 1_000,
      deadlineMs: 60_000,
    });
    expect(mocks.deploy).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId: "dep_1",
        imageRef: "vibrail/app:dep_1",
        traefik: expect.objectContaining({ network: "edge" }),
      }),
    );
    expect(mocks.setContainerId).toHaveBeenCalledWith("dep_1", "new-container");
    expect(mocks.destroy).toHaveBeenCalledWith("old-container");
  });

  it("keeps the existing container when DNS is still not resolvable", async () => {
    mocks.waitForDns.mockResolvedValue(false);

    const result = await retryProjectApplicationRoutes({
      project,
      deployment,
      runtime,
      usesManagedRouting: true,
    });

    expect(result).toEqual({
      attemptedRoutes: 1,
      failures: [{ hostname: route.hostname, message: "DNS is still not publicly resolvable" }],
    });
    expect(mocks.deploy).not.toHaveBeenCalled();
    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it("removes the replacement and preserves the old container when persistence fails", async () => {
    mocks.setContainerId.mockRejectedValue(new Error("database unavailable"));

    const result = await retryProjectApplicationRoutes({
      project,
      deployment,
      runtime,
      usesManagedRouting: true,
    });

    expect(result.failures).toEqual([
      { hostname: route.hostname, message: "database unavailable" },
    ]);
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    expect(mocks.destroy).toHaveBeenCalledWith("new-container");
    expect(mocks.destroy).not.toHaveBeenCalledWith("old-container");
  });

  it("does not report success when no project-level route was inspected", async () => {
    mocks.buildRoutes.mockReturnValue([]);

    await expect(
      retryProjectApplicationRoutes({
        project,
        deployment,
        runtime,
        usesManagedRouting: true,
      }),
    ).resolves.toEqual({ failures: [], attemptedRoutes: 0 });
    expect(mocks.syncDns).not.toHaveBeenCalled();
  });
});
