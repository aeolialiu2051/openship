import { describe, expect, it } from "vitest";
import {
  DOCKER_OVERVIEW_COMMAND,
  isTransientBuildContainer,
  parseDockerOverview,
} from "./docker-overview";

describe("DOCKER_OVERVIEW_COMMAND", () => {
  it("does not request stats collectors for stopped containers", () => {
    expect(DOCKER_OVERVIEW_COMMAND).toContain("docker ps -a");
    expect(DOCKER_OVERVIEW_COMMAND).toContain("docker stats --no-stream");
    expect(DOCKER_OVERVIEW_COMMAND).not.toContain("docker stats --all");
  });
});

describe("parseDockerOverview", () => {
  it("merges docker ps state with docker stats metrics", () => {
    const raw = [
      "__VIBRAIL_DOCKER_PS__",
      JSON.stringify({
        ID: "abcdef1234567890",
        Image: "ghcr.io/vibrail/api:latest",
        Names: "vibrail-api-1",
        Labels:
          "vibrail.project=proj_abc123,vibrail.deployment=dep_123,vibrail.service=api,com.docker.compose.project=vibrail",
        State: "running",
        Status: "Up 16 hours (healthy)",
      }),
      JSON.stringify({
        ID: "deadbeef12345678",
        Image: "redis:7",
        Names: "vibrail-redis-1",
        State: "exited",
        Status: "Exited (0) 2 hours ago",
      }),
      "__VIBRAIL_DOCKER_STATS__",
      JSON.stringify({
        Container: "abcdef123456",
        Name: "vibrail-api-1",
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
        name: "vibrail-api-1",
        running: true,
        health: "healthy",
        projectId: "proj_abc123",
        deploymentId: "dep_123",
        serviceName: "api",
        composeProject: "vibrail",
        uptimeSeconds: 16 * 60 * 60,
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
        name: "vibrail-redis-1",
        running: false,
        uptimeSeconds: null,
        cpuPercent: null,
      }),
    ]);
  });

  it("parses the current container uptime from Docker status", () => {
    const raw = [
      "__VIBRAIL_DOCKER_PS__",
      JSON.stringify({
        ID: "abcdef1234567890",
        Image: "nginx:latest",
        Names: "vibrail-web",
        State: "running",
        Status: "Up 4 minutes (healthy)",
      }),
      "__VIBRAIL_DOCKER_STATS__",
    ].join("\n");

    expect(parseDockerOverview(raw)[0]?.uptimeSeconds).toBe(240);
  });

  it("drops malformed Vibrail project labels while retaining compose identity", () => {
    const raw = [
      "__VIBRAIL_DOCKER_PS__",
      JSON.stringify({
        ID: "abcdef1234567890",
        Image: "nginx:latest",
        Names: "foreign-web",
        Labels:
          "vibrail.project=../../other,com.docker.compose.project=foreign,com.docker.compose.service=web",
        State: "running",
        Status: "Up 2 minutes",
      }),
      "__VIBRAIL_DOCKER_STATS__",
    ].join("\n");

    expect(parseDockerOverview(raw)[0]).toEqual(
      expect.objectContaining({
        projectId: null,
        composeProject: "foreign",
        composeService: "web",
      }),
    );
  });

  it("retains URL-safe nanoid project labels", () => {
    const raw = [
      "__VIBRAIL_DOCKER_PS__",
      JSON.stringify({
        ID: "abcdef1234567890",
        Image: "nginx:latest",
        Names: "vibrail-web",
        Labels: "vibrail.project=proj_j_FHHc7x1DNo5q7I,vibrail.service=web",
        State: "running",
        Status: "Up 2 minutes",
      }),
      "__VIBRAIL_DOCKER_STATS__",
    ].join("\n");

    expect(parseDockerOverview(raw)[0]).toEqual(
      expect.objectContaining({
        projectId: "proj_j_FHHc7x1DNo5q7I",
        serviceName: "web",
        running: true,
      }),
    );
  });
});

describe("isTransientBuildContainer", () => {
  it("keeps a deployed service that inherited its image build label", () => {
    expect(
      isTransientBuildContainer({
        buildId: "build_123",
        deploymentId: "dep_123",
        serviceName: "hermes-webui",
      }),
    ).toBe(false);
  });

  it("filters a build-only helper container", () => {
    expect(
      isTransientBuildContainer({
        buildId: "build_123",
        deploymentId: null,
        serviceName: null,
      }),
    ).toBe(true);
  });
});
