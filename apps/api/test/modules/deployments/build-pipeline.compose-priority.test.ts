import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  isMultiServiceProject,
  resolveProjectServicePreflightServices,
  shouldUseProjectServicePipeline,
} = vi.hoisted(() => ({
  isMultiServiceProject: vi.fn(),
  resolveProjectServicePreflightServices: vi.fn(),
  shouldUseProjectServicePipeline: vi.fn(),
}));

vi.mock("../../../src/modules/deployments/compose", () => ({
  executeComposePipeline: vi.fn(),
  isMultiServiceProject,
  resolveProjectServicePreflightServices,
  shouldUseProjectServicePipeline,
}));

import { resolveServicePipelineMode } from "../../../src/modules/deployments/build-pipeline";

describe("resolveServicePipelineMode Compose priority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveProjectServicePreflightServices.mockResolvedValue([{ name: "web" }]);
    shouldUseProjectServicePipeline.mockResolvedValue(true);
  });

  it("ignores an explicit single-app request for a Compose project", async () => {
    isMultiServiceProject.mockReturnValue(true);

    const result = await resolveServicePipelineMode(
      { id: "project-1", framework: "docker-compose" } as any,
      { serviceDeploymentMode: "single" } as any,
    );

    expect(result).toEqual({
      useSingleAppPipeline: false,
      useServicePipeline: true,
      servicePreflightServices: [{ name: "web" }],
    });
    expect(resolveProjectServicePreflightServices).toHaveBeenCalled();
  });

  it("still honors single-app mode for a non-Compose project", async () => {
    isMultiServiceProject.mockReturnValue(false);

    const result = await resolveServicePipelineMode(
      { id: "project-1", framework: "nextjs" } as any,
      { serviceDeploymentMode: "single" } as any,
    );

    expect(result).toEqual({
      useSingleAppPipeline: true,
      useServicePipeline: false,
      servicePreflightServices: [],
    });
    expect(resolveProjectServicePreflightServices).not.toHaveBeenCalled();
  });
});
