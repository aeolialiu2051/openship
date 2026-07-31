import { beforeEach, describe, expect, it, vi } from "vitest";

const updateStatus = vi.fn();
vi.mock("@repo/db", () => ({
  repos: { deployment: { updateStatus: (...args: unknown[]) => updateStatus(...args) } },
}));

import {
  clearServiceRoutingWarning,
  getServiceRoutingWarning,
  markServiceRoutingWarning,
} from "./deployment-routing-warning";

describe("service routing warning metadata", () => {
  beforeEach(() => updateStatus.mockReset());

  it("marks the active deployment as routing-unsynced", async () => {
    const deployment = { id: "dep_1", status: "success", meta: { serverId: "server_1" } } as any;

    await markServiceRoutingWarning(deployment, "DNS write failed");

    expect(updateStatus).toHaveBeenCalledWith("dep_1", "success", {
      meta: {
        serverId: "server_1",
        serviceRoutingWarning: "DNS write failed",
        edgeUnsynced: true,
        deployWarning: "DNS write failed",
      },
    });
  });

  it("clears only the service-owned warning after a successful retry", async () => {
    const deployment = {
      id: "dep_1",
      status: "success",
      meta: {
        serverId: "server_1",
        serviceRoutingWarning: "DNS write failed",
        edgeUnsynced: true,
        deployWarning: "DNS write failed",
      },
    } as any;

    await clearServiceRoutingWarning(deployment);

    expect(updateStatus).toHaveBeenCalledWith("dep_1", "success", {
      meta: { serverId: "server_1" },
    });
  });

  it("does not clear an unrelated deployment warning", async () => {
    const deployment = {
      id: "dep_1",
      status: "success",
      meta: {
        serviceRoutingWarning: "DNS write failed",
        edgeUnsynced: true,
        deployWarning: "A separate deployment warning",
      },
    } as any;

    await clearServiceRoutingWarning(deployment);

    expect(updateStatus).toHaveBeenCalledWith("dep_1", "success", {
      meta: { edgeUnsynced: true, deployWarning: "A separate deployment warning" },
    });
    expect(getServiceRoutingWarning(deployment)).toBe("DNS write failed");
  });
});
