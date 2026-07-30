import { describe, it, expect } from "vitest";
import {
  resolveBuildRuntimeModes,
  resolveDeployRouting,
  resolveTraefikRoutePort,
} from "./build-execution-plan";

/**
 * Locks the behavior-equivalence tables the pipeline restructure relied on. Each
 * case is one of the deploy "paths"; the expected values are what the pre-restructure
 * inline flips + `instanceof` checks produced.
 */

describe("resolveBuildRuntimeModes (pre-resolve flip, as data)", () => {
  it("services → Docker for both build and serve (any target)", () => {
    expect(
      resolveBuildRuntimeModes({
        hasServer: true,
        serverId: "srv_1",
        baseTarget: "selfhosted",
        effectiveTarget: "server",
        willRunServices: true,
      }),
    ).toEqual({ buildRuntimeMode: "docker", serveRuntimeMode: "docker" });

    // services win even for a hasServer=false/cloud-ish shape
    expect(
      resolveBuildRuntimeModes({
        hasServer: false,
        serverId: null,
        baseTarget: "cloud",
        effectiveTarget: "cloud",
        willRunServices: true,
      }),
    ).toEqual({ buildRuntimeMode: "docker", serveRuntimeMode: "docker" });
  });

  it("static on a remote server → Docker owns build and serve lifecycle", () => {
    expect(
      resolveBuildRuntimeModes({
        hasServer: false,
        serverId: "srv_1",
        baseTarget: "desktop",
        effectiveTarget: "server",
        willRunServices: false,
      }),
    ).toEqual({ buildRuntimeMode: "docker", serveRuntimeMode: "docker" });
  });

  it("static on a self-hosted host (no serverId) → Docker owns build and serve lifecycle", () => {
    expect(
      resolveBuildRuntimeModes({
        hasServer: false,
        serverId: null,
        baseTarget: "selfhosted",
        effectiveTarget: "local",
        willRunServices: false,
      }),
    ).toEqual({ buildRuntimeMode: "docker", serveRuntimeMode: "docker" });
  });

  it("static cloud target → no flip (CloudRuntime owns it)", () => {
    expect(
      resolveBuildRuntimeModes({
        hasServer: false,
        serverId: null,
        baseTarget: "cloud",
        effectiveTarget: "cloud",
        willRunServices: false,
      }),
    ).toEqual({ buildRuntimeMode: undefined, serveRuntimeMode: undefined });

    // local-orchestrated cloud (self-hosted base, effective cloud) also no flip
    expect(
      resolveBuildRuntimeModes({
        hasServer: false,
        serverId: null,
        baseTarget: "selfhosted",
        effectiveTarget: "cloud",
        willRunServices: false,
      }),
    ).toEqual({ buildRuntimeMode: undefined, serveRuntimeMode: undefined });
  });

  it("static on Docker-less desktop 'This Machine' → no flip (build with its own mode)", () => {
    expect(
      resolveBuildRuntimeModes({
        hasServer: false,
        serverId: null,
        baseTarget: "desktop",
        effectiveTarget: "local",
        willRunServices: false,
      }),
    ).toEqual({ buildRuntimeMode: undefined, serveRuntimeMode: undefined });
  });

  it("server app → no flip (use configured runtime)", () => {
    for (const baseTarget of ["desktop", "selfhosted"] as const) {
      expect(
        resolveBuildRuntimeModes({
          hasServer: true,
          serverId: "srv_1",
          baseTarget,
          effectiveTarget: "server",
          willRunServices: false,
        }),
      ).toEqual({ buildRuntimeMode: undefined, serveRuntimeMode: undefined });
    }
  });
});

describe("resolveDeployRouting (post-resolve, keyed off runtime.name)", () => {
  it("server app → normal build, server deploy", () => {
    expect(
      resolveDeployRouting({ hasServer: true, runtimeName: "docker", outputDirectory: "dist" }),
    ).toEqual({ buildMode: "normal", deployMode: "server", staticServeOutputDir: "" });
    expect(
      resolveDeployRouting({ hasServer: true, runtimeName: "bare", outputDirectory: "dist" }),
    ).toEqual({ buildMode: "normal", deployMode: "server", staticServeOutputDir: "" });
  });

  it("static + cloud runtime → static-edge (Oblien Pages), normal build", () => {
    expect(
      resolveDeployRouting({ hasServer: false, runtimeName: "cloud", outputDirectory: "dist" }),
    ).toEqual({ buildMode: "normal", deployMode: "static-edge", staticServeOutputDir: "" });
  });

  it("static + docker runtime → generated HTTP container", () => {
    expect(
      resolveDeployRouting({ hasServer: false, runtimeName: "docker", outputDirectory: "dist" }),
    ).toEqual({ buildMode: "normal", deployMode: "static-container", staticServeOutputDir: "" });
  });

  it("static + bare runtime → bare build, file-serve from the output directory", () => {
    expect(
      resolveDeployRouting({ hasServer: false, runtimeName: "bare", outputDirectory: "dist" }),
    ).toEqual({
      buildMode: "static-bare",
      deployMode: "static-file-serve",
      staticServeOutputDir: "dist",
    });
  });
});

describe("resolveTraefikRoutePort", () => {
  it("prefers an explicit route port", () => {
    expect(
      resolveTraefikRoutePort({
        targetPort: 8080,
        targetPath: "/docs",
        isStaticContainer: true,
        runtimePort: 3000,
      }),
    ).toBe(8080);
  });

  it("maps a static-container path route to the generated HTTP server port", () => {
    expect(
      resolveTraefikRoutePort({
        targetPath: "/docs",
        isStaticContainer: true,
        runtimePort: 3000,
      }),
    ).toBe(3000);
  });

  it("does not invent a port for a bare static-file route", () => {
    expect(
      resolveTraefikRoutePort({
        targetPath: "/docs",
        isStaticContainer: false,
        runtimePort: 3000,
      }),
    ).toBeUndefined();
  });
});
