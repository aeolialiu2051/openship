import { beforeEach, describe, expect, it, vi } from "vitest";

const { collectDeploymentManifest, executeCleanup, repos } = vi.hoisted(() => ({
  collectDeploymentManifest: vi.fn(),
  executeCleanup: vi.fn(),
  repos: {
    project: {
      findById: vi.fn(),
      setActiveDeployment: vi.fn(),
    },
    deployment: {
      findById: vi.fn(),
      deleteDeployment: vi.fn(),
    },
    service: {
      listByDeployment: vi.fn(),
    },
  },
}));

vi.mock("@repo/db", () => ({ repos }));

vi.mock("../../../src/modules/projects/project-cleanup.service", () => ({
  collectDeploymentManifest,
  executeCleanup,
}));

vi.mock("../../../src/modules/github/github-access", () => ({
  assertGitHubRepoAccess: vi.fn(),
}));

vi.mock("../../../src/modules/deployments/rollback", () => ({
  rollback: vi.fn(),
  setPin: vi.fn(),
}));

import {
  deleteDeployment,
  DeploymentCleanupError,
} from "../../../src/modules/deployments/deployment.service";

const deployment = {
  id: "dep_1",
  organizationId: "org_1",
  projectId: "proj_1",
  status: "ready",
  containerId: "container_1",
};

const project = {
  id: "proj_1",
  organizationId: "org_1",
  appTemplateId: null,
  activeDeploymentId: "dep_1",
};

describe("deleteDeployment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repos.deployment.findById.mockResolvedValue(deployment);
    repos.project.findById.mockResolvedValue(project);
    collectDeploymentManifest.mockResolvedValue({
      projectId: project.id,
      resources: [
        {
          type: "container",
          ref: deployment.containerId,
          label: "deployment container",
          runtime: {},
        },
      ],
    });
  });

  it("keeps the deployment row and active pointer when runtime cleanup fails", async () => {
    const cleanup = {
      total: 1,
      succeeded: 0,
      failed: [
        {
          type: "container",
          ref: deployment.containerId,
          label: "deployment container",
          error: "docker timeout",
        },
      ],
    };
    executeCleanup.mockResolvedValue(cleanup);

    await expect(deleteDeployment(deployment.id, "org_1")).rejects.toEqual(
      expect.objectContaining<Partial<DeploymentCleanupError>>({
        name: "DeploymentCleanupError",
        cleanup,
      }),
    );

    expect(repos.project.setActiveDeployment).not.toHaveBeenCalled();
    expect(repos.deployment.deleteDeployment).not.toHaveBeenCalled();
  });

  it("can retry the same retained deployment and delete it after cleanup recovers", async () => {
    executeCleanup
      .mockResolvedValueOnce({
        total: 1,
        succeeded: 0,
        failed: [
          {
            type: "container",
            ref: deployment.containerId,
            label: "deployment container",
            error: "docker timeout",
          },
        ],
      })
      .mockResolvedValueOnce({ total: 1, succeeded: 1, failed: [] });

    await expect(deleteDeployment(deployment.id, "org_1")).rejects.toBeInstanceOf(
      DeploymentCleanupError,
    );
    await expect(deleteDeployment(deployment.id, "org_1")).resolves.toEqual({
      cleanup: { total: 1, succeeded: 1, failed: [] },
    });

    expect(repos.deployment.findById).toHaveBeenCalledTimes(2);
    expect(repos.project.setActiveDeployment).toHaveBeenCalledWith(
      project.id,
      null,
    );
    expect(repos.deployment.deleteDeployment).toHaveBeenCalledWith(deployment.id);
  });
});
