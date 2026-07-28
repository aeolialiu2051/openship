import { describe, expect, it, vi } from "vitest";
import { PassThrough } from "node:stream";
import { DockerRuntime } from "../src/runtime/docker";

describe("DockerRuntime container status normalization", () => {
  it("opens service terminals through an SSH PTY for remote Docker targets", async () => {
    const runtime = await DockerRuntime.create();
    const session = {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      setWindow: vi.fn(),
      close: vi.fn(),
      onClose: vi.fn(),
    };
    const openShell = vi.fn(async () => session);
    const exec = vi.fn(async (command: string) => {
      expect(command).toBe(
        "docker --host 'unix:///run/user/1000/docker.sock' inspect 'container-1'",
      );
      return JSON.stringify([{ State: { Running: true, Status: "running" } }]);
    });

    (runtime as any).transport = { kind: "ssh" };
    (runtime as any).connectionOptions = {
      transport: "ssh",
      dockerSocketPath: "/run/user/1000/docker.sock",
      executor: { exec, openShell },
    };

    await expect(
      runtime.openServiceShell("container-1", {
        cols: 120,
        rows: 40,
        term: "xterm-256color",
      }),
    ).resolves.toBe(session);
    expect(openShell).toHaveBeenCalledWith(
      { cols: 120, rows: 40, term: "xterm-256color" },
      "docker --host 'unix:///run/user/1000/docker.sock' exec -it " +
        "-e 'TERM=xterm-256color' 'container-1' " +
        "/bin/sh -lc 'exec $(command -v bash || echo /bin/sh)'",
    );
  });

  it("correctly identifies running status when State.Running is true regardless of State.Status casing", async () => {
    const runtime = await DockerRuntime.create();

    // Mock container inspect response
    const mockInspectInfo: any = {
      Id: "container-12345",
      State: {
        Status: "Running",
        Running: true,
        Paused: false,
        StartedAt: new Date(Date.now() - 60000).toISOString(),
      },
      NetworkSettings: { Networks: {}, Ports: {} },
    };

    // Override internal docker container inspect
    runtime.docker.getContainer = (() => ({
      inspect: async () => mockInspectInfo,
    })) as any;

    const info = await runtime.getContainerInfo("container-12345");
    expect(info.status).toBe("running");
    expect(info.uptimeSeconds).toBeGreaterThan(0);
  });

  it("handles health check status strings like 'healthy' and 'starting'", async () => {
    const runtime = await DockerRuntime.create();

    const mockInspectInfo: any = {
      Id: "container-67890",
      State: {
        Status: "healthy",
        Running: false, // In case Running flag is false or not set
        Paused: false,
        StartedAt: new Date(Date.now() - 30000).toISOString(),
      },
      NetworkSettings: { Networks: {}, Ports: {} },
    };

    runtime.docker.getContainer = (() => ({
      inspect: async () => mockInspectInfo,
    })) as any;

    const info = await runtime.getContainerInfo("container-67890");
    expect(info.status).toBe("running");
  });

  it("normalizes listDeploymentContainers state string in case-insensitive manner", async () => {
    const runtime = await DockerRuntime.create();

    runtime.docker.listContainers = (async () => [
      {
        Id: "c1",
        State: "Running",
        Labels: { "openship.deployment": "dep1", "openship.service": "web" },
      },
      {
        Id: "c2",
        State: "HEALTHY",
        Labels: { "openship.deployment": "dep1", "openship.service": "db" },
      },
      {
        Id: "c3",
        State: "Exited",
        Labels: { "openship.deployment": "dep1", "openship.service": "cache" },
      },
    ]) as any;

    const results = await runtime.listDeploymentContainers("dep1");
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ containerId: "c1", status: "running", serviceName: "web" });
    expect(results[1]).toEqual({ containerId: "c2", status: "running", serviceName: "db" });
    expect(results[2]).toEqual({ containerId: "c3", status: "stopped", serviceName: "cache" });
  });

  it("requests untruncated IDs when listing containers over the remote Docker CLI", async () => {
    const runtime = await DockerRuntime.create();
    const fullId = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const commands: string[] = [];
    (runtime as any).transport = { kind: "ssh" };
    (runtime as any).connectionOptions = {
      executor: {
        exec: async (command: string) => {
          commands.push(command);
          if (command.includes("inspect --format")) return "web";
          return `${JSON.stringify({ ID: fullId, State: "running" })}\n`;
        },
      },
    };

    const results = await runtime.listDeploymentContainers("dep1");

    expect(commands.some((command) => command.includes("ps -a --no-trunc"))).toBe(true);
    expect(results).toEqual([{ containerId: fullId, status: "running", serviceName: "web" }]);
  });

  it("listAllContainers carries the RAW state, status line and network ip", async () => {
    // The live service-state read matches on these fields: the raw state (so
    // `restarting` isn't collapsed into running), the human status line (health
    // suffix) and the ip from the list view (no extra inspect round-trip).
    const runtime = await DockerRuntime.create();

    runtime.docker.listContainers = (async () => [
      {
        Id: "c_api",
        Names: ["/openship-openship-api"],
        Image: "openship/openship-api:bld_x",
        ImageID: "sha256:1",
        State: "Restarting",
        Status: "Restarting (1) 44 seconds ago",
        Labels: { "openship.project": "proj_1", "openship.service": "api" },
        Ports: [{ PrivatePort: 4000, PublicPort: 4000, Type: "tcp" }],
        Mounts: [],
        NetworkSettings: { Networks: { "openship-openship": { IPAddress: "172.18.0.7" } } },
      },
    ]) as any;

    const [c] = await runtime.listAllContainers();
    expect(c).toMatchObject({
      id: "c_api",
      names: ["openship-openship-api"],
      state: "restarting",
      status: "Restarting (1) 44 seconds ago",
      ip: "172.18.0.7",
    });
    expect(c.ports[0]).toMatchObject({ privatePort: 4000, publicPort: 4000 });
  });

  it("listAllContainers omits ip when no network reports one", async () => {
    const runtime = await DockerRuntime.create();
    runtime.docker.listContainers = (async () => [
      {
        Id: "c_stopped",
        Names: ["/openship-openship-web"],
        Image: "img",
        ImageID: "sha256:2",
        State: "exited",
        Status: "Exited (0) 5 minutes ago",
        Labels: {},
        Ports: [],
        Mounts: [],
        NetworkSettings: { Networks: { bridge: { IPAddress: "" } } },
      },
    ]) as any;

    const [c] = await runtime.listAllContainers();
    expect(c.ip).toBeUndefined();
    expect(c.state).toBe("exited");
  });

  it("uses bounded Docker CLI reads for SSH discovery instead of the HTTP bridge", async () => {
    const remoteDockerExec = vi.fn(async (args: string) => {
      if (args === "container ls --all --quiet --no-trunc") return "container-1\n";
      if (args === "container inspect 'container-1'") {
        return JSON.stringify([
          {
            Id: "container-1",
            Name: "/web",
            Image: "sha256:image-1",
            Config: {
              Image: "nginx:latest",
              Labels: { "com.docker.compose.project": "site" },
            },
            State: { Status: "running", Health: { Status: "healthy" } },
            Mounts: [],
            NetworkSettings: {
              Networks: { site: { IPAddress: "172.20.0.2" } },
              Ports: { "80/tcp": [{ HostIp: "0.0.0.0", HostPort: "8080" }] },
            },
          },
        ]);
      }
      if (args === "volume ls --quiet") return "site_data\n";
      if (args === "volume inspect 'site_data'") {
        return JSON.stringify([
          {
            Name: "site_data",
            Driver: "local",
            Mountpoint: "/var/lib/docker/volumes/site_data/_data",
            Labels: { "com.docker.compose.project": "site" },
          },
        ]);
      }
      if (args === "network ls --quiet --no-trunc") return "network-1\n";
      if (args === "network inspect 'network-1'") {
        return JSON.stringify([
          {
            Id: "network-1",
            Name: "site_default",
            Driver: "bridge",
            Labels: { "com.docker.compose.project": "site" },
          },
        ]);
      }
      if (args.includes("image inspect --format")) return '["NGINX_VERSION=1.27"]';
      throw new Error(`Unexpected command: ${args}`);
    });
    const runtime = Object.create(DockerRuntime.prototype) as DockerRuntime;
    Object.defineProperties(runtime, {
      transport: { value: { kind: "ssh" } },
      connectionOptions: { value: { executor: {} } },
      remoteDockerExec: { value: remoteDockerExec },
      _docker: {
        value: {
          listContainers: () => {
            throw new Error("HTTP bridge must not be used");
          },
          listVolumes: () => {
            throw new Error("HTTP bridge must not be used");
          },
          listNetworks: () => {
            throw new Error("HTTP bridge must not be used");
          },
        },
      },
    });

    const [containers, volumes, networks, env] = await Promise.all([
      runtime.listAllContainers(),
      runtime.listAllVolumes(),
      runtime.listAllNetworks(),
      runtime.inspectImageEnv("nginx:latest"),
    ]);

    expect(containers[0]).toMatchObject({
      id: "container-1",
      names: ["web"],
      state: "running",
      status: "running (healthy)",
      ip: "172.20.0.2",
      composeProject: "site",
    });
    expect(containers[0]?.ports[0]).toMatchObject({
      privatePort: 80,
      publicPort: 8080,
      ip: "0.0.0.0",
    });
    expect(volumes[0]).toMatchObject({ name: "site_data", composeProject: "site" });
    expect(networks[0]).toMatchObject({ id: "network-1", name: "site_default" });
    expect(env).toEqual(["NGINX_VERSION=1.27"]);
    expect(remoteDockerExec).toHaveBeenCalledWith("container ls --all --quiet --no-trunc", {
      timeout: 30_000,
    });
  });
});
