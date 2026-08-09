import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectFindById: vi.fn(),
  projectUpdate: vi.fn(),
  deploymentFindById: vi.fn(),
  servicesListByDeployment: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("@repo/db", () => ({
  repos: {
    project: { findById: mocks.projectFindById, update: mocks.projectUpdate },
    deployment: { findById: mocks.deploymentFindById },
    service: { listByDeployment: mocks.servicesListByDeployment },
  },
}));

vi.mock("../../lib/controller-helpers", () => ({
  assertResourceInOrg: vi.fn(),
  platform: vi.fn(),
}));

vi.mock("../../lib/deployment-runtime", () => ({
  resolveDeploymentRuntimeOnly: vi.fn(async () => ({
    runtime: {
      name: "docker",
      start: mocks.start,
      stop: mocks.stop,
      dispose: mocks.dispose,
    },
  })),
  resolveDeploymentPlatform: vi.fn(),
  usesManagedRouting: vi.fn(),
}));

import {
  disableProject,
  enableProject,
  runtimeContainerIds,
} from "./project-runtime.service";

describe("project runtime state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectFindById.mockResolvedValue({
      id: "proj_1",
      organizationId: "org_1",
      activeDeploymentId: "dep_1",
      active: true,
    });
    mocks.deploymentFindById.mockResolvedValue({
      id: "dep_1",
      organizationId: "org_1",
      containerId: "container_api",
      meta: {},
    });
    mocks.servicesListByDeployment.mockResolvedValue([
      { containerId: "container_db" },
      { containerId: "container_api" },
    ]);
    mocks.projectUpdate.mockResolvedValue(undefined);
    mocks.start.mockResolvedValue(undefined);
    mocks.stop.mockResolvedValue(undefined);
    mocks.dispose.mockResolvedValue(undefined);
  });

  it("de-duplicates the primary container from service deployment rows", () => {
    expect(
      runtimeContainerIds("container_api", [
        { containerId: "container_db" },
        { containerId: "container_api" },
        { containerId: null },
      ]),
    ).toEqual(["container_db", "container_api"]);
  });

  it("stops every service before persisting the disabled state", async () => {
    await expect(disableProject("proj_1", "org_1")).resolves.toMatchObject({
      success: true,
      active: false,
    });

    expect(mocks.stop.mock.calls.map(([id]) => id)).toEqual([
      "container_db",
      "container_api",
    ]);
    expect(mocks.projectUpdate).toHaveBeenCalledWith("proj_1", { active: false });
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });

  it("starts every service before persisting the enabled state", async () => {
    await enableProject("proj_1", "org_1");

    expect(mocks.start.mock.calls.map(([id]) => id)).toEqual([
      "container_db",
      "container_api",
    ]);
    expect(mocks.projectUpdate).toHaveBeenCalledWith("proj_1", { active: true });
  });

  it("does not persist a partial transition and compensates completed containers", async () => {
    mocks.stop
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("docker unavailable"));

    await expect(disableProject("proj_1", "org_1")).rejects.toThrow("docker unavailable");

    expect(mocks.start).toHaveBeenCalledWith("container_db");
    expect(mocks.projectUpdate).not.toHaveBeenCalled();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });
});
