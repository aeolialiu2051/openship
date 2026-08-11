import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listManagedForReconcile: vi.fn(),
  markRouteReconciled: vi.fn(),
  findProject: vi.fn(),
  findDeployment: vi.fn(),
  getServer: vi.fn(),
  provisionServerOrigin: vi.fn(),
  installServerAuthorityRoute: vi.fn(),
}));

const store = {
  get: vi.fn(),
  publish: vi.fn(),
  disable: vi.fn(),
};

vi.mock("@repo/db", () => ({
  repos: {
    domain: {
      listManagedForReconcile: mocks.listManagedForReconcile,
      markRouteReconciled: mocks.markRouteReconciled,
    },
    project: { findById: mocks.findProject },
    deployment: { findById: mocks.findDeployment },
    server: { get: mocks.getServer },
  },
}));
vi.mock("../../lib/edge-route-projection", () => ({ edgeRouteStore: () => store }));
vi.mock("../../lib/server-origin-infra", () => ({
  provisionServerOrigin: mocks.provisionServerOrigin,
}));
vi.mock("../../lib/server-route-authority", () => ({
  installServerAuthorityRoute: mocks.installServerAuthorityRoute,
  removeServerAuthorityRoute: vi.fn(),
}));

import { runEdgeRouteReconcileSweep } from "./edge-route-reconcile.service";

describe("edge route reconcile sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const baseDomain = {
      projectId: "project-1",
      serviceId: null,
      domainType: "free",
      routeStatus: "active",
      routeVersion: 1,
      updatedAt: new Date("2026-08-11T00:00:00Z"),
    };
    mocks.listManagedForReconcile.mockResolvedValue([
      { ...baseDomain, id: "domain-1", hostname: "one.vibrail.app" },
      { ...baseDomain, id: "domain-2", hostname: "two.vibrail.app" },
    ]);
    mocks.findProject.mockResolvedValue({ activeDeploymentId: "deployment-1" });
    mocks.findDeployment.mockResolvedValue({ meta: { serverId: "server-1" } });
    mocks.getServer.mockResolvedValue({ id: "server-1", routingId: "eb9ebf4d" });
    mocks.provisionServerOrigin.mockResolvedValue("server-eb9ebf4d.vibrail.app");
    mocks.installServerAuthorityRoute.mockResolvedValue(undefined);
    mocks.markRouteReconciled.mockResolvedValue(undefined);
    store.get.mockResolvedValue(null);
    store.publish.mockResolvedValue(undefined);
  });

  it("repairs each server origin only once per sweep", async () => {
    const summary = await runEdgeRouteReconcileSweep();

    expect(summary.published).toBe(2);
    expect(mocks.provisionServerOrigin).toHaveBeenCalledOnce();
    expect(store.publish).toHaveBeenCalledTimes(2);
  });
});
