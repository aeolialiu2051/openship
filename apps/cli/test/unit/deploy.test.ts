import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  inGitRepo: true,
  apiRequest: vi.fn(),
  deployFolder: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(() => Buffer.from(h.inGitRepo ? "true\n" : "")),
}));

vi.mock("../../src/lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
  apiRequest: h.apiRequest,
}));

vi.mock("../../src/lib/folder-deploy", () => ({
  deployFolder: h.deployFolder,
}));

vi.mock("../../src/lib/project-link", () => ({
  readProjectLink: () => ({ projectId: "proj_1", branch: "main" }),
}));

vi.mock("../../src/lib/deploy-stream", () => ({
  streamDeploymentLogs: vi.fn(),
}));

vi.mock("ora", () => ({
  default: () => ({
    text: "",
    start() {
      return this;
    },
    succeed: vi.fn(),
    fail: vi.fn(),
  }),
}));

import { deployCommand } from "../../src/commands/deploy";
import { runCommand } from "../helpers/harness";

beforeEach(() => {
  h.inGitRepo = true;
  h.apiRequest.mockReset();
  h.deployFolder.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("vibrail deploy server target", () => {
  it("passes --server-id through the Git deployment entry point", async () => {
    h.apiRequest.mockResolvedValue({
      data: { success: true, deployment_id: "dep_1", project_id: "proj_1" },
    });

    const { code } = await runCommand(deployCommand, ["--server-id", "srv_1"]);

    expect(code).toBe(0);
    expect(h.apiRequest).toHaveBeenCalledWith("/deployments", {
      method: "POST",
      body: JSON.stringify({
        projectId: "proj_1",
        branch: "main",
        environment: "production",
        deployTarget: "server",
        serverId: "srv_1",
        runtimeMode: "docker",
      }),
    });
  });

  it("binds --server to a fresh folder upload", async () => {
    h.inGitRepo = false;
    h.deployFolder.mockResolvedValue({ deploymentId: "dep_2", projectId: "proj_2" });

    const { code } = await runCommand(deployCommand, ["--server", "srv_2"]);

    expect(code).toBe(0);
    expect(h.deployFolder).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj_1",
        environment: "production",
        serverId: "srv_2",
      }),
    );
  });

  it("rejects conflicting values for the two aliases", async () => {
    const { code, err } = await runCommand(deployCommand, [
      "--server",
      "srv_1",
      "--server-id",
      "srv_2",
    ]);

    expect(code).toBe(1);
    expect(err).toContain("must refer to the same server");
    expect(h.apiRequest).not.toHaveBeenCalled();
    expect(h.deployFolder).not.toHaveBeenCalled();
  });
});
