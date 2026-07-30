import { describe, expect, it, vi } from "vitest";
import type { CommandExecutor, LogEntry } from "../types";
import { installDocker } from "./installer";

function dockerExecutor(options?: {
  startCode?: number;
  daemonRunning?: boolean;
  root?: boolean;
}) {
  const startCode = options?.startCode ?? 0;
  const daemonRunning = options?.daemonRunning ?? true;

  const exec = vi.fn(async (command: string) => {
    if (command === "uname -s") return "Linux";
    if (command === "uname -m") return "x86_64";
    if (command === "cat /etc/os-release") return 'ID="ubuntu"';
    if (command === "command -v apt-get") return "/usr/bin/apt-get";
    if (command === "command -v systemctl") return "/usr/bin/systemctl";
    if (command === "id -un") return options?.root === false ? "deploy" : "root";
    if (command === "id -u") return options?.root === false ? "1000" : "0";
    if (command.includes("sudo -n true")) return "yes";
    if (command.includes("docker --version")) return "Docker version 29.6.2, build test";
    if (command.includes("until docker info --format")) {
      if (!daemonRunning) throw new Error("Cannot connect to the Docker daemon");
      return "29.6.2";
    }
    throw new Error(`Unexpected command: ${command}`);
  });

  const streamExec = vi.fn(
    async (command: string, _onLog: (entry: LogEntry) => void) => ({
      code: command.includes("systemctl enable --now docker") ? startCode : 0,
      output: "",
    }),
  );

  return {
    executor: { exec, streamExec } as unknown as CommandExecutor,
    exec,
    streamExec,
  };
}

describe("installDocker", () => {
  it("fails when the Docker service cannot be started", async () => {
    const { executor, exec } = dockerExecutor({ startCode: 1 });

    const result = await installDocker(executor, () => {});

    expect(result).toMatchObject({
      component: "docker",
      success: false,
      error: "docker installed but failed to start",
    });
    expect(exec).not.toHaveBeenCalledWith("docker --version");
  });

  it("fails when Docker is installed but its daemon is unavailable", async () => {
    const { executor } = dockerExecutor({ daemonRunning: false });

    const result = await installDocker(executor, () => {});

    expect(result).toMatchObject({
      component: "docker",
      success: false,
      error: "Docker is installed but the daemon is not running",
    });
  });

  it("only reports success after the Docker daemon responds", async () => {
    const { executor, exec } = dockerExecutor();

    const result = await installDocker(executor, () => {});

    expect(result).toMatchObject({
      component: "docker",
      success: true,
      version: "29.6.2",
    });
    expect(exec).toHaveBeenCalledWith(expect.stringContaining("until docker info --format"));
  });

  it("grants a non-root SSH user Docker socket access", async () => {
    const { executor, streamExec } = dockerExecutor({ root: false });

    const result = await installDocker(executor, () => {});

    expect(result.success).toBe(true);
    expect(
      streamExec.mock.calls.some(([command]) =>
        String(command).includes("usermod -aG docker") && String(command).includes("deploy"),
      ),
    ).toBe(true);
  });
});
