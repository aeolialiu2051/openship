import { describe, expect, it } from "vitest";
import { resolveProjectLogCapabilities } from "./log-capabilities";

describe("resolveProjectLogCapabilities", () => {
  it("streams Docker logs for an active self-hosted static application", () => {
    expect(resolveProjectLogCapabilities({
      activeDeploymentId: "dep_static",
      deployTarget: "server",
      effectiveHasServer: false,
      hasServices: false,
    })).toMatchObject({
      hasStaticContainerRuntime: true,
      hasProjectRuntime: true,
      canShowTerminal: true,
      canShowLogs: true,
    });
  });

  it("keeps cloud static applications on request logs only", () => {
    expect(resolveProjectLogCapabilities({
      activeDeploymentId: "dep_cloud_static",
      deployTarget: "cloud",
      effectiveHasServer: false,
      hasServices: false,
    })).toMatchObject({
      hasStaticContainerRuntime: false,
      canShowTerminal: false,
      isRequestLogsOnly: true,
    });
  });

  it("does not invent a runtime for an undeployed static project", () => {
    expect(resolveProjectLogCapabilities({
      activeDeploymentId: null,
      deployTarget: "server",
      effectiveHasServer: false,
      hasServices: false,
    }).canShowLogs).toBe(false);
  });

  it("does not add a duplicate project runtime to services projects", () => {
    expect(resolveProjectLogCapabilities({
      activeDeploymentId: "dep_services",
      deployTarget: "server",
      effectiveHasServer: true,
      hasServices: true,
    })).toMatchObject({
      hasProjectRuntime: false,
      canShowRuntimeLogs: true,
    });
  });
});
