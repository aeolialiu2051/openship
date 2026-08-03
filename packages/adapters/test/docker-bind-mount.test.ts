import { describe, expect, it, vi } from "vitest";
import { DockerRuntime } from "../src/runtime/docker";
import type { CommandExecutor } from "../src/types";

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

  it("uses bounded Docker CLI deployment for SSH runtimes", async () => {
    const writeFile = vi.fn<CommandExecutor["writeFile"]>(async () => {});
    const exec = vi.fn<CommandExecutor["exec"]>(async () => "");
    const rm = vi.fn<CommandExecutor["rm"]>(async () => {});
    const executor = { writeFile, exec, rm } as unknown as CommandExecutor;
    const remoteDockerExec = vi.fn(async () => "container-remote-123\n");
    const runtime = Object.create(DockerRuntime.prototype) as DockerRuntime;
    Object.defineProperties(runtime, {
      transport: { value: { kind: "ssh" } },
      connectionOptions: { value: { executor } },
      remoteDockerExec: { value: remoteDockerExec },
    });

    await expect(
      runtime.deploy({
        deploymentId: "dep-remote-1",
        projectId: "project-remote-1",
        buildSessionId: "build-remote-1",
        imageRef: "vibrail/webmail:test",
        environment: "production",
        port: 4080,
        startCommand: "bun run server/src/main.ts",
        envVars: { SECRET: "not-on-command-line" },
        resources: { cpuCores: 1, memoryMb: 512, diskMb: 1024 },
        bindMounts: [
          {
            source: "/var/lib/vibrail-webmail",
            target: "/var/lib/vibrail-webmail",
          },
        ],
        traefik: {
          network: "vibrail-edge",
          entrypoint: "websecure",
          tls: true,
          routes: [
            {
              routerName: "webmail-4080",
              hostname: "webmail.example.com",
              port: 4080,
              tls: true,
            },
          ],
        },
      }),
    ).resolves.toMatchObject({
      deploymentId: "dep-remote-1",
      containerId: "container-remote-123",
      status: "running",
    });

    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/vibrail-env-dep-remote-1",
      expect.stringContaining("SECRET=not-on-command-line\n"),
    );
    expect(exec).toHaveBeenCalledWith("chmod 600 '/tmp/vibrail-env-dep-remote-1'");
    expect(remoteDockerExec).toHaveBeenCalledOnce();
    const [command, options] = remoteDockerExec.mock.calls[0]!;
    expect(options).toEqual({ timeout: 120_000 });
    expect(command).toContain("run -d --name 'vibrail-project-remote-1-dep-remote-1'");
    expect(command).toContain("--network 'vibrail-edge'");
    expect(command).toContain("--expose '4080'");
    expect(command).toContain("--volume '/var/lib/vibrail-webmail:/var/lib/vibrail-webmail'");
    expect(command).toContain("--env-file '/tmp/vibrail-env-dep-remote-1'");
    expect(command).not.toContain("not-on-command-line");
    expect(command).toContain("'vibrail/webmail:test' 'sh' '-c'");
    expect(rm).toHaveBeenCalledWith("/tmp/vibrail-env-dep-remote-1");
  });

  it("cleans up a possibly-created remote container after docker run fails", async () => {
    const executor = {
      writeFile: vi.fn(async () => {}),
      exec: vi.fn(async () => ""),
      rm: vi.fn(async () => {}),
    } as unknown as CommandExecutor;
    const remoteDockerExec = vi
      .fn()
      .mockRejectedValueOnce(new Error("remote docker run timed out"))
      .mockResolvedValueOnce("");
    const runtime = Object.create(DockerRuntime.prototype) as DockerRuntime;
    Object.defineProperties(runtime, {
      transport: { value: { kind: "ssh" } },
      connectionOptions: { value: { executor } },
      remoteDockerExec: { value: remoteDockerExec },
    });

    await expect(
      runtime.deploy({
        deploymentId: "dep-remote-failure",
        projectId: "project-remote-failure",
        buildSessionId: "build-remote-failure",
        imageRef: "vibrail/webmail:test",
        environment: "production",
        port: 4080,
        envVars: {},
        resources: { cpuCores: 1, memoryMb: 512, diskMb: 1024 },
      }),
    ).rejects.toThrow("remote docker run timed out");

    expect(remoteDockerExec).toHaveBeenNthCalledWith(
      2,
      "rm -f 'vibrail-project-remote-failure-dep-remote-failure'",
    );
    expect(executor.rm).toHaveBeenCalledWith("/tmp/vibrail-env-dep-remote-failure");
  });
});
