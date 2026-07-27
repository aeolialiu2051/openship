import { describe, expect, it } from "vitest";
import { parseDockerOverview } from "./docker-overview";

describe("parseDockerOverview", () => {
  it("merges docker ps state with docker stats metrics", () => {
    const raw = [
      "__OPENSHIP_DOCKER_PS__",
      JSON.stringify({
        ID: "abcdef1234567890",
        Image: "ghcr.io/openship/api:latest",
        Names: "openship-api-1",
        Labels:
          "openship.project=proj_abc123,openship.deployment=dep_123,openship.service=api,com.docker.compose.project=openship",
        State: "running",
        Status: "Up 16 hours (healthy)",
      }),
      JSON.stringify({
        ID: "deadbeef12345678",
        Image: "redis:7",
        Names: "openship-redis-1",
        State: "exited",
        Status: "Exited (0) 2 hours ago",
      }),
      "__OPENSHIP_DOCKER_STATS__",
      JSON.stringify({
        Container: "abcdef123456",
        Name: "openship-api-1",
        CPUPerc: "2.75%",
        MemUsage: "242MiB / 1GiB",
        MemPerc: "23.63%",
        NetIO: "136MB / 81MB",
        BlockIO: "725kB / 0B",
        PIDs: "18",
      }),
    ].join("\n");

    expect(parseDockerOverview(raw)).toEqual([
      expect.objectContaining({
        name: "openship-api-1",
        running: true,
        health: "healthy",
        projectId: "proj_abc123",
        deploymentId: "dep_123",
        serviceName: "api",
        composeProject: "openship",
        cpuPercent: 2.75,
        memoryUsage: "242MiB",
        memoryLimit: "1GiB",
        memoryPercent: 23.63,
        networkRx: "136MB",
        networkTx: "81MB",
        blockRead: "725kB",
        blockWrite: "0B",
        pids: 18,
      }),
      expect.objectContaining({
        name: "openship-redis-1",
        running: false,
        cpuPercent: null,
      }),
    ]);
  });

  it("drops malformed Openship project labels while retaining compose identity", () => {
    const raw = [
      "__OPENSHIP_DOCKER_PS__",
      JSON.stringify({
        ID: "abcdef1234567890",
        Image: "nginx:latest",
        Names: "foreign-web",
        Labels:
          "openship.project=../../other,com.docker.compose.project=foreign,com.docker.compose.service=web",
        State: "running",
        Status: "Up 2 minutes",
      }),
      "__OPENSHIP_DOCKER_STATS__",
    ].join("\n");

    expect(parseDockerOverview(raw)[0]).toEqual(
      expect.objectContaining({
        projectId: null,
        composeProject: "foreign",
        composeService: "web",
      }),
    );
  });
});
