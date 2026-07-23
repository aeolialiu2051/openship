import { describe, expect, it, vi } from "vitest";

import type { BuildConfig, CommandExecutor } from "../types";
import type { MultiServiceDeployConfig } from "./types";
import { BuildLogger } from "./build-pipeline";
import { DockerRuntime } from "./docker";

describe("DockerRuntime SSH builds", () => {
  it("disposes Docker HTTP sockets and the transport exactly once", async () => {
    const destroy = vi.fn();
    const close = vi.fn(async () => {});
    const runtime = Object.create(DockerRuntime.prototype) as DockerRuntime;

    Object.defineProperties(runtime, {
      disposed: { value: false, writable: true },
      _docker: { value: { modem: { agent: { destroy } } } },
      transport: { value: { close } },
    });

    await runtime.dispose();
    await runtime.dispose();

    expect(destroy).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("builds against the same remote socket used by the Docker API bridge", async () => {
    const streamExec = vi.fn<CommandExecutor["streamExec"]>(
      async () => ({ code: 0, output: "" }),
    );
    const resetConnections = vi.fn(async () => {});
    const executor = { streamExec } as unknown as CommandExecutor;
    const runtime = Object.create(DockerRuntime.prototype) as DockerRuntime;

    Object.defineProperty(runtime, "connectionOptions", {
      value: {
        transport: "ssh",
        executor,
        dockerSocketPath: "/run/user/1000/docker.sock",
      },
    });
    Object.defineProperty(runtime, "transport", {
      value: { resetConnections },
    });

    const config = {
      envVars: {},
      projectId: "project-1",
      sessionId: "build-1",
    } as unknown as BuildConfig;

    await (runtime as unknown as {
      buildImageOnRemote(
        config: BuildConfig,
        remoteContextDir: string,
        dockerfileName: string,
        tag: string,
        logger: BuildLogger,
      ): Promise<void>;
    }).buildImageOnRemote(
      config,
      "/tmp/openship-build-build-1",
      "Dockerfile",
      "openship/app:build-1",
      new BuildLogger(),
    );

    expect(streamExec).toHaveBeenCalledOnce();
    expect(streamExec.mock.calls[0]?.[0]).toContain(
      "docker --host 'unix:///run/user/1000/docker.sock' build",
    );
    expect(resetConnections).toHaveBeenCalledOnce();
  });

  it("pulls against the same remote socket used by the Docker API bridge", async () => {
    const exec = vi.fn<CommandExecutor["exec"]>(async (command) => {
      if (command.includes("image inspect")) throw new Error("No such image");
      return "";
    });
    const resetConnections = vi.fn(async () => {});
    const executor = { exec } as unknown as CommandExecutor;
    const runtime = Object.create(DockerRuntime.prototype) as DockerRuntime;

    Object.defineProperties(runtime, {
      connectionOptions: {
        value: {
          transport: "ssh",
          executor,
          dockerSocketPath: "/run/user/1000/docker.sock",
        },
      },
      transport: {
        value: { kind: "ssh", resetConnections },
      },
    });

    await runtime.pullImage("postgres:16-alpine");

    expect(exec).toHaveBeenLastCalledWith(
      "docker --host 'unix:///run/user/1000/docker.sock' pull 'postgres:16-alpine'",
      { timeout: 10 * 60_000 },
    );
    expect(resetConnections).not.toHaveBeenCalled();
  });

  it("deploys an SSH service through bounded Docker CLI commands", async () => {
    const remoteDockerExec = vi.fn(async (args: string) => {
      if (args.startsWith("run ")) return "container-123";
      if (args === "inspect 'container-123'") {
        return JSON.stringify([
          {
            Id: "container-123",
            State: { Status: "running", Running: true, StartedAt: new Date().toISOString() },
            Config: { Image: "openship/app:test", Labels: {}, ExposedPorts: {} },
            NetworkSettings: {
              Networks: { app: { IPAddress: "172.20.0.3", NetworkID: "network-1" } },
              Ports: {},
            },
          },
        ]);
      }
      if (args.includes("image inspect --format")) return "[]";
      return "";
    });
    const writeFile = vi.fn(async () => {});
    const exec = vi.fn(async () => "");
    const rm = vi.fn(async () => {});
    const runtime = Object.create(DockerRuntime.prototype) as DockerRuntime;
    Object.defineProperties(runtime, {
      transport: { value: { kind: "ssh" } },
      connectionOptions: { value: { executor: { writeFile, exec, rm } } },
      remoteDockerExec: { value: remoteDockerExec },
    });

    const config = {
      deploymentId: "deployment-4",
      projectId: "project-4",
      slug: "app",
      serviceName: "web",
      image: "openship/app:test",
      ports: ["8080:3000"],
      environment: { NODE_ENV: "production" },
      volumes: ["data:/data"],
      namespaceVolumes: true,
      command: "node server.js",
      restart: "unless-stopped",
    } as MultiServiceDeployConfig;

    await expect(
      runtime.deployServiceWorkload({ id: "network-1" }, config),
    ).resolves.toMatchObject({
      containerId: "container-123",
      status: "running",
      ip: "172.20.0.3",
    });

    const runCommand = remoteDockerExec.mock.calls.find(([args]) => args.startsWith("run "))?.[0];
    expect(runCommand).toContain("--network 'network-1'");
    expect(runCommand).toContain("--publish '8080:3000'");
    expect(runCommand).toContain("--env-file '/tmp/openship-env-deployment-4-web'");
    expect(runCommand).toContain("'openship/app:test' sh -c 'node server.js'");
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/openship-env-deployment-4-web",
      "NODE_ENV=production\n",
    );
    expect(rm).toHaveBeenCalledWith("/tmp/openship-env-deployment-4-web");
  });

  it("ensures the remote project network through Docker CLI, not dockerode", async () => {
    const remoteDockerExec = vi.fn(async () => "network-cli-1");
    const runtime = Object.create(DockerRuntime.prototype) as DockerRuntime;
    Object.defineProperties(runtime, {
      transport: { value: { kind: "ssh" } },
      connectionOptions: { value: { executor: {} } },
      remoteDockerExec: { value: remoteDockerExec },
    });

    await expect(runtime.ensureNetwork("app")).resolves.toBe("network-cli-1");
    expect(remoteDockerExec).toHaveBeenCalledWith(
      "network inspect --format '{{.Id}}' 'openship-app'",
      { timeout: 20_000 },
    );
  });

  it("verifies a remote build through the CLI with a bounded timeout", async () => {
    const exec = vi.fn<CommandExecutor["exec"]>(async () => "sha256:abc");
    const executor = { exec } as unknown as CommandExecutor;
    const runtime = Object.create(DockerRuntime.prototype) as DockerRuntime;

    Object.defineProperty(runtime, "connectionOptions", {
      value: {
        transport: "ssh",
        executor,
        dockerSocketPath: "/run/user/1000/docker.sock",
      },
    });

    await (runtime as unknown as {
      assertBuiltImageExists(tag: string, executor: CommandExecutor): Promise<void>;
    }).assertBuiltImageExists("openship/app:build-1", executor);

    expect(exec).toHaveBeenCalledWith(
      "docker --host 'unix:///run/user/1000/docker.sock' image inspect --format '{{.Id}}' 'openship/app:build-1'",
      { timeout: 30_000 },
    );
  });

  it("reconnects and retries shared service group preparation after a stale socket", async () => {
    const resetConnections = vi.fn(async () => {});
    const ensureNetwork = vi
      .fn()
      .mockRejectedValueOnce(new Error("The socket connection was closed unexpectedly"))
      .mockResolvedValueOnce("network-1");
    const reconcileNetworkMembership = vi.fn(async () => {});
    const runtime = Object.create(DockerRuntime.prototype) as DockerRuntime;

    Object.defineProperties(runtime, {
      transport: {
        value: { kind: "ssh", resetConnections },
      },
      ensureNetwork: { value: ensureNetwork },
      reconcileNetworkMembership: { value: reconcileNetworkMembership },
    });

    await expect(
      runtime.ensureServiceGroup({
        deploymentId: "deployment-1",
        projectId: "project-1",
        slug: "app",
      }),
    ).resolves.toEqual({ id: "network-1" });

    // Before attempt 1, after its failure (to drain it), before attempt 2.
    expect(resetConnections).toHaveBeenCalledTimes(3);
    expect(ensureNetwork).toHaveBeenCalledTimes(2);
    expect(reconcileNetworkMembership).toHaveBeenCalledOnce();
  });

  it("waits for a timed-out network operation to release before retrying", async () => {
    vi.useFakeTimers();
    try {
      let rejectFirst: ((error: Error) => void) | undefined;
      const ensureNetwork = vi
        .fn()
        .mockImplementationOnce(
          () => new Promise<string>((_resolve, reject) => { rejectFirst = reject; }),
        )
        .mockResolvedValueOnce("network-2");
      const resetConnections = vi.fn(async () => {
        // Call 1 is the pre-attempt reset. Call 2 is the timeout recovery and
        // must make the original dockerode request settle/release its lock.
        if (resetConnections.mock.calls.length === 2) {
          rejectFirst?.(new Error("socket connection was closed unexpectedly"));
        }
      });
      const reconcileNetworkMembership = vi.fn(async () => {});
      const runtime = Object.create(DockerRuntime.prototype) as DockerRuntime;

      Object.defineProperties(runtime, {
        transport: { value: { kind: "ssh", resetConnections } },
        ensureNetwork: { value: ensureNetwork },
        reconcileNetworkMembership: { value: reconcileNetworkMembership },
      });

      const result = runtime.ensureServiceGroup({
        deploymentId: "deployment-2",
        projectId: "project-2",
        slug: "app-2",
      });
      await vi.advanceTimersByTimeAsync(20_000);

      await expect(result).resolves.toEqual({ id: "network-2" });
      expect(ensureNetwork).toHaveBeenCalledTimes(2);
      expect(resetConnections).toHaveBeenCalledTimes(3);
      expect(reconcileNetworkMembership).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not queue a retry behind a Docker operation that never drains", async () => {
    vi.useFakeTimers();
    try {
      const ensureNetwork = vi.fn(() => new Promise<string>(() => {}));
      const resetConnections = vi.fn(async () => {});
      const runtime = Object.create(DockerRuntime.prototype) as DockerRuntime;

      Object.defineProperties(runtime, {
        transport: { value: { kind: "ssh", resetConnections } },
        ensureNetwork: { value: ensureNetwork },
        reconcileNetworkMembership: { value: vi.fn(async () => {}) },
      });

      const result = runtime.ensureServiceGroup({
        deploymentId: "deployment-3",
        projectId: "project-3",
        slug: "app-3",
      });
      const expectation = expect(result).rejects.toThrow(
        "refusing to retry while it may still hold the provisioning lock",
      );
      await vi.advanceTimersByTimeAsync(25_000);
      await expectation;

      expect(ensureNetwork).toHaveBeenCalledOnce();
      expect(resetConnections).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
