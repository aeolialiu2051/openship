import { describe, expect, it } from "vitest";
import type { DockerContainerOverview, DockerOverviewResponse } from "@/lib/api/system";
import { groupDockerContainers } from "./docker-overview-view";

function container(
  name: string,
  overrides: Partial<DockerContainerOverview> = {},
): DockerContainerOverview {
  return {
    id: name,
    name,
    image: `${name}:latest`,
    projectId: null,
    deploymentId: null,
    serviceName: null,
    buildId: null,
    composeProject: null,
    composeService: null,
    state: "running",
    status: "Up 1 hour",
    health: null,
    running: true,
    cpuPercent: 0,
    memoryUsage: "10MiB",
    memoryLimit: "1GiB",
    memoryPercent: 1,
    networkRx: "1MB",
    networkTx: "2MB",
    blockRead: "3MB",
    blockWrite: "4MB",
    pids: 1,
    ...overrides,
  };
}

function response(containers: DockerContainerOverview[]): DockerOverviewResponse {
  return {
    server: {
      id: "server-1",
      name: "Server",
      isLocal: false,
      sshHost: "example.com",
      sshPort: 22,
      sshUser: "root",
    },
    summary: { runningProjects: 1, runningContainers: 3, totalContainers: containers.length },
    projects: [
      {
        id: "proj_alpha",
        name: "Alpha",
        slug: "alpha",
        environmentName: "Production",
        environmentSlug: "production",
        isApp: false,
        containers: [],
      },
    ],
    containers,
    collectedAt: new Date(0).toISOString(),
  };
}

describe("groupDockerContainers", () => {
  it("groups managed, compose, and standalone containers without dropping stopped rows", () => {
    const groups = groupDockerContainers(
      response([
        container("alpha-api", { projectId: "proj_alpha" }),
        container("alpha-worker", {
          projectId: "proj_alpha",
          state: "exited",
          running: false,
        }),
        container("foreign-db", { composeProject: "foreign" }),
        container("loose-container"),
      ]),
    );

    expect(groups.map((group) => [group.kind, group.name, group.containers.length])).toEqual([
      ["project", "Alpha", 2],
      ["compose", "foreign", 1],
      ["standalone", "", 1],
    ]);
    expect(groups[0]?.containers.map((row) => row.name)).toEqual(["alpha-api", "alpha-worker"]);
  });
});
