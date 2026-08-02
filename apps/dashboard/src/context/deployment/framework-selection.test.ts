import { describe, expect, it } from "vitest";
import type { DeploymentConfig } from "./types";
import { getFrameworkSelectionUpdates } from "./framework-selection";

function makeConfig(overrides: Partial<DeploymentConfig> = {}): DeploymentConfig {
  const options: DeploymentConfig["options"] = {
    buildCommand: "",
    outputDirectory: "",
    productionPaths: "",
    installCommand: "",
    startCommand: "",
    productionPort: "",
    rootDirectory: "./",
    hasServer: true,
    hasBuild: true,
    ...overrides.options,
  };
  const config = {
    projectName: "example",
    repo: "example",
    owner: "owner",
    buildStrategy: "server",
    deployTarget: "cloud",
    runtimeMode: "docker",
    projectType: "services",
    framework: "docker-compose",
    detectedFramework: "docker-compose",
    packageManager: "npm",
    buildImage: "ubuntu:22.04",
    publicEndpoints: [],
    envVars: [],
    rootEnvVars: [],
    branch: "main",
    branches: ["main"],
    services: [],
    serviceDeploymentMode: "single",
    productionPortTouched: false,
    lastAutoDetectedEnvPort: null,
    ...overrides,
    options,
  };
  return config as DeploymentConfig;
}

describe("getFrameworkSelectionUpdates", () => {
  it("switches a compose-shaped config to Python defaults", () => {
    const updates = getFrameworkSelectionUpdates(makeConfig({ packageManager: "npm" }), "python");

    expect(updates).toMatchObject({
      framework: "python",
      packageManager: "pip",
      buildImage: "python:3.12-slim",
      options: {
        buildCommand: "pip install -r requirements.txt",
        outputDirectory: ".",
        startCommand: "python app.py",
        productionPort: "8000",
        hasServer: true,
        hasBuild: true,
      },
    });
  });

  it("configures React as a static build", () => {
    const updates = getFrameworkSelectionUpdates(makeConfig(), "react");

    expect(updates.options).toMatchObject({
      outputDirectory: "build",
      productionPort: "",
      hasServer: false,
      hasBuild: true,
    });
  });

  it("keeps a supported package manager for Next.js", () => {
    const updates = getFrameworkSelectionUpdates(makeConfig({ packageManager: "pnpm" }), "nextjs");

    expect(updates).toMatchObject({
      framework: "nextjs",
      packageManager: "pnpm",
      buildImage: "node:22",
      options: {
        buildCommand: "next build",
        startCommand: "next start",
        productionPort: "3000",
        hasServer: true,
      },
    });
  });
});
