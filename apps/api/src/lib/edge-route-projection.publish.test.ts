import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServer: vi.fn(),
  updateRouteState: vi.fn(),
  provisionServerOrigin: vi.fn(),
  installServerAuthorityRoute: vi.fn(),
  waitForManagedRoutePropagation: vi.fn(),
}));

vi.mock("@repo/db", () => ({
  repos: {
    server: { get: mocks.getServer },
    domain: { updateRouteState: mocks.updateRouteState },
  },
}));
vi.mock("../config/env", () => ({ env: {} }));
vi.mock("./server-origin-infra", () => ({
  provisionServerOrigin: mocks.provisionServerOrigin,
}));
vi.mock("./server-route-authority", () => ({
  installServerAuthorityRoute: mocks.installServerAuthorityRoute,
  removeServerAuthorityRoute: vi.fn(),
}));
vi.mock("./edge-route-readiness", () => ({
  waitForManagedRoutePropagation: mocks.waitForManagedRoutePropagation,
}));

import { publishManagedDomainRoute, setEdgeRouteStoreForTest } from "./edge-route-projection";

describe("publishManagedDomainRoute", () => {
  const server = {
    id: "server-db-id",
    routingId: "eb9ebf4d",
    organizationId: "org-1",
    sshHost: "136.118.60.116",
  };
  const domain = {
    id: "domain-1",
    hostname: "app-91svxf3f.vibrail.app",
    projectId: "project-1",
    serviceId: null,
    domainType: "free",
    routeVersion: 1,
  };
  const store = { publish: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    setEdgeRouteStoreForTest(store as never);
    mocks.getServer.mockResolvedValue(server);
    mocks.provisionServerOrigin.mockResolvedValue("server-eb9ebf4d.vibrail.app");
    mocks.installServerAuthorityRoute.mockResolvedValue(undefined);
    mocks.waitForManagedRoutePropagation.mockResolvedValue(true);
    mocks.updateRouteState.mockResolvedValue(undefined);
    store.publish.mockResolvedValue(undefined);
  });

  it("repairs the server origin before publishing its edge route", async () => {
    await publishManagedDomainRoute(domain as never, server.id);

    expect(mocks.provisionServerOrigin).toHaveBeenCalledWith(server);
    expect(store.publish).toHaveBeenCalledOnce();
    expect(mocks.provisionServerOrigin.mock.invocationCallOrder[0]).toBeLessThan(
      store.publish.mock.invocationCallOrder[0]!,
    );
  });

  it("does not publish a route when server-origin repair fails", async () => {
    mocks.provisionServerOrigin.mockRejectedValueOnce(new Error("origin DNS write failed"));

    await expect(publishManagedDomainRoute(domain as never, server.id)).rejects.toThrow(
      "origin DNS write failed",
    );
    expect(mocks.installServerAuthorityRoute).not.toHaveBeenCalled();
    expect(store.publish).not.toHaveBeenCalled();
  });
});
