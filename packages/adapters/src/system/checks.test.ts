import { describe, expect, it, vi } from "vitest";
import type { CommandExecutor } from "../types";
import { checkDocker } from "./checks";

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
