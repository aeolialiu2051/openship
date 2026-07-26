import { describe, expect, it } from "vitest";
import type { Service } from "@repo/db";
import { projectServicesToDeployableServices } from "../../../src/modules/deployments/compose/project-services";

describe("projectServicesToDeployableServices", () => {
  it("preserves advanced command compatibility metadata across redeploy snapshots", () => {
    const [service] = projectServicesToDeployableServices([
      {
        kind: "compose",
        enabled: true,
        name: "postgres",
        image: "postgres:18-alpine",
        ports: [],
        dependsOn: [],
        environment: { PGDATA: "/var/lib/postgresql/data" },
        volumes: [],
        command:
          "postgres -c max_connections=100 -c shared_buffers=128MB -c effective_cache_size=4GB -c maintenance_work_mem=64MB",
        advanced: { commandMode: "exec" },
      } as Service,
    ]);

    expect(service).toMatchObject({
      name: "postgres",
      command: expect.stringMatching(/^postgres /),
      advanced: { commandMode: "exec" },
    });
  });
});
