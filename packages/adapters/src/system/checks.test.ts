import { describe, expect, it, vi } from "vitest";
import type { CommandExecutor } from "../types";
import { checkDocker, checkSslCertificates, checkTraefik } from "./checks";

function dockerCheckExecutor({ elevatedWorks }: { elevatedWorks: boolean }) {
  const exec = vi.fn(async (command: string) => {
    if (command === "docker --version") return "Docker version 29.6.2, build test";
    if (command === "uname -s") return "Linux";
    if (command === "uname -m") return "x86_64";
    if (command === "cat /etc/os-release") return "ID=ubuntu";
    if (command === "command -v apt-get") return "/usr/bin/apt-get";
    if (command === "command -v systemctl") return "/usr/bin/systemctl";
    if (command === "id -u") return "1000";
    if (command.includes("sudo -n true")) return "yes";
    if (command.includes("sudo -n sh -c") && command.includes("docker info")) {
      if (elevatedWorks) return "29.6.2";
      throw new Error("daemon unavailable");
    }
    if (command === "docker info --format '{{.ServerVersion}}'") {
      throw new Error("permission denied while trying to connect to the Docker daemon socket");
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  return { executor: { exec } as unknown as CommandExecutor, exec };
}

describe("checkDocker", () => {
  it("distinguishes Docker socket permissions from a stopped daemon", async () => {
    const { executor } = dockerCheckExecutor({ elevatedWorks: true });

    const result = await checkDocker(executor);

    expect(result).toMatchObject({
      installed: true,
      running: true,
      healthy: false,
    });
    expect(result.message).toContain("SSH user cannot access the Docker socket");
  });

  it("reports the daemon as stopped when even the elevated probe fails", async () => {
    const { executor } = dockerCheckExecutor({ elevatedWorks: false });

    const result = await checkDocker(executor);

    expect(result).toMatchObject({
      installed: true,
      running: false,
      healthy: false,
      message: "Docker is installed but the daemon is not running",
    });
  });
});

describe("checkSslCertificates", () => {
  it("counts Traefik ACME certificates without returning certificate data", async () => {
    const exec = vi.fn(async (command: string) => {
      if (command.includes("/etc/letsencrypt/live")) return "0";
      if (command.includes("docker volume inspect vibrail-edge-acme")) {
        return "/var/lib/docker/volumes/vibrail-edge-acme/_data";
      }
      if (command.includes("acme.json")) return "3";
      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await checkSslCertificates({ exec } as unknown as CommandExecutor);

    expect(result).toMatchObject({
      installed: true,
      healthy: true,
      certificateStatus: {
        state: "present",
        count: 3,
        sourceCounts: { traefik: 3 },
      },
    });
    expect(
      exec.mock.calls.some(([command]) => String(command).includes("cat /letsencrypt/acme.json")),
    ).toBe(false);
  });

  it("counts Certbot certificates when Traefik storage is absent", async () => {
    const exec = vi.fn(async (command: string) => {
      if (command.includes("/etc/letsencrypt/live")) return "2";
      if (command.includes("docker volume inspect vibrail-edge-acme")) throw new Error("No such volume");
      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await checkSslCertificates({ exec } as unknown as CommandExecutor);

    expect(result).toMatchObject({
      installed: true,
      healthy: true,
      certificateStatus: {
        state: "present",
        count: 2,
        sourceCounts: { certbot: 2 },
      },
    });
  });

  it("reports an empty certificate inventory", async () => {
    const exec = vi.fn(async (command: string) => {
      if (command.includes("/etc/letsencrypt/live")) return "0";
      if (command.includes("docker volume inspect vibrail-edge-acme")) throw new Error("No such volume");
      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await checkSslCertificates({ exec } as unknown as CommandExecutor);

    expect(result).toMatchObject({
      label: "SSL certificates",
      installed: false,
      healthy: false,
      certificateStatus: { state: "absent", count: 0 },
    });
  });

});

describe("checkTraefik", () => {
  it("reports the managed Traefik image version and running state", async () => {
    const exec = vi.fn(async (command: string) => {
      if (command.includes("docker ps -a")) {
        return "vibrail-edge|traefik:v3.3|running";
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await checkTraefik({ exec } as unknown as CommandExecutor);

    expect(result).toMatchObject({
      name: "traefik",
      label: "Traefik",
      version: "3.3",
      installed: true,
      running: true,
      healthy: true,
    });
  });

  it("reports a stopped Traefik container as unhealthy", async () => {
    const exec = vi.fn(async (command: string) => {
      if (command.includes("docker ps -a")) {
        return "vibrail-edge|traefik:v3.3|exited";
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await checkTraefik({ exec } as unknown as CommandExecutor);

    expect(result).toMatchObject({
      version: "3.3",
      installed: true,
      running: false,
      healthy: false,
    });
  });

  it("reads the binary version when the image tag is not a version", async () => {
    const exec = vi.fn(async (command: string) => {
      if (command.includes("docker ps -a")) {
        return "vibrail-edge|traefik:latest|running";
      }
      if (command.includes("docker exec 'vibrail-edge' traefik version")) {
        return "3.6.2";
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await checkTraefik({ exec } as unknown as CommandExecutor);

    expect(result).toMatchObject({ version: "3.6.2", healthy: true });
  });
});
