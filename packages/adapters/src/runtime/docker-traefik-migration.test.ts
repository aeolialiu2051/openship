import { describe, expect, it, vi } from "vitest";

import { DockerRuntime } from "./docker";
import { VIBRAIL_EDGE_CONFIG_VERSION_LABEL, VIBRAIL_EDGE_MANAGED_LABEL } from "./traefik-edge";

describe("DockerRuntime managed Traefik migration", () => {
  it("does not treat the just-removed old edge as a remaining 80/443 owner", async () => {
    const runtime = Object.create(DockerRuntime.prototype) as DockerRuntime;
    const internals = runtime as unknown as Record<string, unknown>;
    const destroy = vi.fn().mockResolvedValue(undefined);
    const start = vi.fn().mockResolvedValue(undefined);

    internals.traefikEdgePromise = undefined;
    internals.provisionLock = undefined;
    internals.connectionOptions = undefined;
    const exec = vi.fn(async (command: string) => {
      if (command === "id -u") return "0";
      return "";
    });
    const writeFile = vi.fn().mockResolvedValue(undefined);
    internals.systemManager = {
      executor: {
        exec,
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile,
      },
    };
    internals.listAllContainers = vi.fn().mockResolvedValue([
      {
        id: "old-edge",
        names: ["vibrail-edge"],
        image: "traefik:v3.6",
        state: "running",
        status: "Up",
        ports: [
          { privatePort: 80, publicPort: 80, type: "tcp" },
          { privatePort: 443, publicPort: 443, type: "tcp" },
        ],
        labels: {
          [VIBRAIL_EDGE_MANAGED_LABEL]: "true",
          [VIBRAIL_EDGE_CONFIG_VERSION_LABEL]: "4",
        },
      },
    ]);
    internals.inspectContainer = vi.fn().mockResolvedValue({
      id: "old-edge",
      name: "vibrail-edge",
      image: "traefik:v3.6",
      imageId: "sha256:old",
      state: "running",
      command: [],
      env: [],
      labels: {
        [VIBRAIL_EDGE_MANAGED_LABEL]: "true",
        [VIBRAIL_EDGE_CONFIG_VERSION_LABEL]: "4",
      },
      networks: ["vibrail-edge"],
      mounts: [],
      ports: [
        { privatePort: 80, publicPort: 80, type: "tcp" },
        { privatePort: 443, publicPort: 443, type: "tcp" },
      ],
    });
    internals.destroy = destroy;
    internals.ensureNamedNetwork = vi.fn().mockResolvedValue("network-id");
    internals.pullImage = vi.fn().mockResolvedValue(undefined);
    internals.usesRemoteDockerCli = vi.fn().mockReturnValue(false);
    internals._docker = {
      createContainer: vi.fn().mockResolvedValue({ id: "new-edge", start }),
    };

    await expect(runtime.ensureSharedTraefik()).resolves.toMatchObject({
      source: "vibrail",
      containerId: "new-edge",
    });
    expect(destroy).toHaveBeenCalledWith("old-edge");
    expect(internals.pullImage).toHaveBeenCalledWith(
      expect.stringContaining("vibrail-edge"),
      { force: true },
    );
    expect(writeFile).toHaveBeenCalledWith(
      "/var/lib/vibrail/traefik/dynamic/cloudflare-aop.json",
      expect.stringContaining("RequireAndVerifyClientCert"),
    );
    expect(start).toHaveBeenCalledOnce();
  });
});
