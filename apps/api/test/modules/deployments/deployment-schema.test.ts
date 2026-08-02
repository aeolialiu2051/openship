import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";

import { BuildAccessBody } from "../../../src/modules/deployments/deployment.schema";

describe("deployment build-access schema", () => {
  it("allows Docker or omission, but rejects the removed bare workload runtime", () => {
    expect(Value.Check(BuildAccessBody, { projectId: "proj_default" })).toBe(true);
    expect(
      Value.Check(BuildAccessBody, { projectId: "proj_docker", runtimeMode: "docker" }),
    ).toBe(true);
    expect(
      Value.Check(BuildAccessBody, { projectId: "proj_bare", runtimeMode: "bare" }),
    ).toBe(false);
  });

  it("preserves compose command execution mode on the deploy wire payload", () => {
    expect(
      Value.Check(BuildAccessBody, {
        projectId: "proj_sub2api",
        serviceDeploymentMode: "services",
        services: [
          {
            name: "postgres",
            image: "postgres:18-alpine",
            ports: [],
            dependsOn: [],
            environment: {},
            volumes: ["postgres_data:/var/lib/postgresql/data"],
            command:
              "postgres -c max_connections=100 -c shared_buffers=128MB " +
              "-c effective_cache_size=4GB -c maintenance_work_mem=64MB",
            advanced: { commandMode: "exec" },
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects an unknown compose command execution mode", () => {
    expect(
      Value.Check(BuildAccessBody, {
        projectId: "proj_sub2api",
        services: [
          {
            name: "postgres",
            ports: [],
            dependsOn: [],
            environment: {},
            volumes: [],
            command: "postgres",
            advanced: { commandMode: "auto" },
          },
        ],
      }),
    ).toBe(false);
  });
});
