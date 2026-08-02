import { beforeEach, describe, expect, it, vi } from "vitest";

const { listByProject, findDeployment, resolveRuntime, reconcile } = vi.hoisted(() => ({
  listByProject: vi.fn(),
  findDeployment: vi.fn(),
  resolveRuntime: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("@repo/db", () => ({
  repos: {
    domain: { listByProject },
    deployment: { findById: findDeployment },
  },
}));

vi.mock("../../../src/lib/deployment-runtime", () => ({
  resolveDeploymentRuntime: resolveRuntime,
}));

vi.mock("../../../src/lib/route-apply.service", () => ({
  reconcileProjectRoutes: reconcile,
}));

vi.mock("../../../src/modules/route-rules/route-rule.service", () => ({
  pushProjectRules: vi.fn().mockResolvedValue(undefined),
}));

import {
  deriveEnvironmentPublicEndpoints,
  reapplyProjectLiveRoutes,
  shouldRefuseLoopbackRoute,
} from "../../../src/modules/domains/project-route.service";

describe("shouldRefuseLoopbackRoute", () => {
  it("refuses a tenant project's public route to the dashboard port on loopback", () => {
    expect(shouldRefuseLoopbackRoute("127.0.0.1", 3001)).toBe(true);
  });

  it("refuses a tenant project's public route to the admin API port on loopback", () => {
    expect(shouldRefuseLoopbackRoute("127.0.0.1", 4000)).toBe(true);
  });

  it("allows a non-reserved port on loopback regardless of self-app status", () => {
    expect(shouldRefuseLoopbackRoute("127.0.0.1", 8080)).toBe(false);
  });

  it("allows any port on a non-loopback host (container IP)", () => {
    expect(shouldRefuseLoopbackRoute("172.17.0.5", 3001)).toBe(false);
  });
});

describe("deriveEnvironmentPublicEndpoints", () => {
  it("clones an explicit proxy target without inventing a fallback port", () => {
    expect(deriveEnvironmentPublicEndpoints([{ port: 4010 }], "preview-app")).toEqual([
      { port: 4010, domain: "preview-app", domainType: "free" },
    ]);
  });

  it("clones an explicit static path target without inventing a port", () => {
    expect(deriveEnvironmentPublicEndpoints([{ targetPath: "/docs" }], "preview-docs")).toEqual([
      { targetPath: "/docs", domain: "preview-docs", domainType: "free" },
    ]);
  });

  it("returns no endpoints when the base project has no explicit destination", () => {
    expect(deriveEnvironmentPublicEndpoints([], "preview-app")).toEqual([]);
  });
});

describe("reapplyProjectLiveRoutes loopback guard", () => {
  // Mirrors the real self-app adopt deployment: explicitly marked bare adopt →
  // the app runs on the host, so the runtime resolves the upstream to
  // 127.0.0.1:<dashboard port> rather than a container IP.
  const project = {
    id: "proj-vibrail",
    slug: "vibrail",
    port: 3001,
    cloudWorkspaceId: null,
    activeDeploymentId: "dep-1",
    organizationId: "org-1",
    webhookDomain: null,
  };

  beforeEach(() => {
    reconcile.mockReset().mockResolvedValue(undefined);
    resolveRuntime.mockReset();
    findDeployment.mockReset();
    listByProject.mockReset();

    // One public hostname → the dashboard port, no static path.
    listByProject.mockResolvedValue([
      {
        id: "dom-1",
        hostname: "panel.example.com",
        isPrimary: true,
        serviceId: null,
        targetPort: 3001,
        targetPath: null,
        domainType: "free",
      },
    ]);
    // Bare adopt deployment: truthy containerId (so we reach resolveTargetUrl),
    // runtime does NOT support containerIp → host resolves to 127.0.0.1.
    findDeployment.mockResolvedValue({
      id: "dep-1",
      containerId: "dep-1",
      meta: { runtimeMode: "bare", adopt: true, controlPlaneAdopt: true },
      organizationId: "org-1",
    });
    resolveRuntime.mockResolvedValue({
      routing: { provider: "bare" },
      runtime: { supports: () => false },
      effectiveTarget: "local",
      serverId: null,
    });
  });

  it("refuses a public route to the reserved loopback dashboard port", async () => {
    await reapplyProjectLiveRoutes(project, []);

    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile.mock.calls[0][1].registers).toEqual([]);
  });
});
