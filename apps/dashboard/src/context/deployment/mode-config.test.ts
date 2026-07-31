import { describe, expect, it } from "vitest";
import { getModeSwitchUpdates } from "./mode-config";
import { DEFAULT_CONFIG, type DeploymentConfig } from "./types";

function makeComposeConfig(): DeploymentConfig {
  return {
    ...DEFAULT_CONFIG,
    projectName: "fastapi-template",
    repo: "fastapi-template",
    projectType: "services",
    framework: "docker-compose",
    detectedFramework: "docker-compose",
    runtimeMode: "docker",
    serviceDeploymentMode: "services",
    services: [
      {
        name: "api",
        build: ".",
        ports: ["8000:8000"],
        dependsOn: [],
        environment: {},
        volumes: [],
        exposed: true,
        exposedPort: "8000",
      },
    ],
    singleAppCandidate: {
      stack: "python",
      projectType: "app",
      category: "backend",
      packageManager: "pip",
      buildCommand: "pip install -r requirements.txt",
      installCommand: "",
      startCommand: "uvicorn app.main:app --host 0.0.0.0 --port 8000",
      buildImage: "python:3.12-slim",
      outputDirectory: ".",
      rootDirectory: ".",
      productionPaths: [],
      port: 8000,
      hasServer: true,
      hasBuild: true,
    },
  };
}

describe("getModeSwitchUpdates", () => {
  it("allows a detected Compose project to switch to its single-app candidate", () => {
    const updates = getModeSwitchUpdates(makeComposeConfig(), "single");

    expect(updates).toMatchObject({
      serviceDeploymentMode: "single",
      framework: "python",
      detectedFramework: "python",
      packageManager: "pip",
      runtimeMode: "bare",
      options: {
        startCommand: "uvicorn app.main:app --host 0.0.0.0 --port 8000",
        productionPort: "8000",
      },
    });
  });
});
