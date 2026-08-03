import { describe, expect, it, vi } from "vitest";
import { DockerRuntime } from "../src/runtime/docker";

describe("DockerRuntime trusted bind mounts", () => {
  it("passes structured bind mounts to the container host config", async () => {
    const runtime = await DockerRuntime.create();
    const start = vi.fn(async () => {});
    const createContainer = vi.fn(async () => ({ id: "container-123", start }));
    runtime.docker.createContainer = createContainer as never;

    await runtime.deploy({
      deploymentId: "dep-1",
      projectId: "project-1",
      buildSessionId: "build-1",
      imageRef: "vibrail/webmail:test",
      environment: "production",
      port: 4080,
      envVars: {},
      resources: { cpuCores: 1, memoryMb: 512, diskMb: 1024 },
      bindMounts: [
        {
          source: "/var/lib/vibrail-webmail",
          target: "/var/lib/vibrail-webmail",
        },
      ],
    });

    expect(createContainer).toHaveBeenCalledOnce();
    expect(createContainer.mock.calls[0]?.[0]).toMatchObject({
      HostConfig: {
        Mounts: [
          {
            Type: "bind",
            Source: "/var/lib/vibrail-webmail",
            Target: "/var/lib/vibrail-webmail",
            ReadOnly: false,
          },
        ],
      },
    });
    expect(start).toHaveBeenCalledOnce();
  });
});
