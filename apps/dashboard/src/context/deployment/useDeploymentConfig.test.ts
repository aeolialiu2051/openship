import { describe, expect, it } from "vitest";
import type { PrepareProjectResponse } from "@/lib/api/deploy";
import { buildPreparedOptions } from "./prepared-options";

function prepareResponse(
  overrides: Partial<PrepareProjectResponse> = {},
): PrepareProjectResponse {
  return {
    stack: "unknown",
    projectType: "app",
    category: "unknown",
    packageManager: "npm",
    installCommand: "",
    buildCommand: "",
    startCommand: "",
    buildImage: "node:22",
    outputDirectory: ".",
    rootDirectory: "./",
    productionPaths: [],
    port: 3000,
    hasServer: false,
    hasBuild: false,
    repository: {
      name: "example",
      full_name: "owner/example",
      private: false,
      default_branch: "main",
    },
    ...overrides,
  };
}

describe("buildPreparedOptions", () => {
  it("marks compose service projects as server-backed without a project start command", () => {
    const options = buildPreparedOptions(
      prepareResponse({
        stack: "docker-compose",
        projectType: "services",
        port: 8787,
        services: [
          {
            name: "hermes-webui",
            build: ".",
            ports: ["127.0.0.1:8787:8787"],
            environment: {},
            volumes: [],
            dependsOn: [],
          },
        ],
      }),
    );

    expect(options.hasServer).toBe(true);
  });

  it("keeps a single app without a start command static", () => {
    expect(buildPreparedOptions(prepareResponse()).hasServer).toBe(false);
  });

  it("honors an explicit static production mode", () => {
    expect(
      buildPreparedOptions(
        prepareResponse({ projectType: "services", productionMode: "static" }),
      ).hasServer,
    ).toBe(false);
  });
});
