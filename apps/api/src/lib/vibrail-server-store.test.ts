import { describe, expect, it } from "vitest";
import type { CommandExecutor } from "@repo/adapters";
import { readVibrailFile, resolveRootExecutor, writeVibrailFile } from "./vibrail-server-store";

function nonRootExecutor(options: { canSudo: boolean; readValue?: string }) {
  const commands: string[] = [];
  const writes: Array<{ path: string; content: string }> = [];
  const exec = {
    async exec(command: string) {
      commands.push(command);
      if (command === "id -u") return "1000";
      if (command.includes("sudo -n true")) return options.canSudo ? "yes" : "no";
      if (command.includes("cat ")) return options.readValue ?? "";
      return "";
    },
    async writeFile(path: string, content: string) {
      writes.push({ path, content });
    },
  } as unknown as CommandExecutor;
  return { exec, commands, writes };
}

describe("vibrail server store privilege handling", () => {
  it("elevates root-owned state operations for a passwordless-sudo SSH user", async () => {
    const stub = nonRootExecutor({ canSudo: true, readValue: "saved-state" });

    await expect(readVibrailFile(stub.exec, "mail-state.json")).resolves.toBe("saved-state");
    await writeVibrailFile(stub.exec, "mail-state.json", "next-state");

    expect(stub.commands.some((command) => command.startsWith("sudo -n sh -c "))).toBe(true);
    expect(stub.writes).toHaveLength(1);
    expect(stub.writes[0]?.path).toMatch(/^\/tmp\/\.vibrail-elev-/);
    expect(stub.writes[0]?.content).toBe("next-state");
  });

  it("elevates streamed install commands through the same cached executor", async () => {
    const streamed: string[] = [];
    const stub = nonRootExecutor({ canSudo: true });
    Object.assign(stub.exec, {
      streamExec: async (command: string) => {
        streamed.push(command);
        return { code: 0, output: "" };
      },
    });

    const rootExec = await resolveRootExecutor(stub.exec);
    await rootExec.streamExec("apt-get update -y", () => {});

    expect(streamed).toHaveLength(1);
    expect(streamed[0]).toContain("sudo -n sh -c");
    expect(streamed[0]).toContain("apt-get update -y");
  });

  it("writes generated app config into a root-owned host path", async () => {
    const stub = nonRootExecutor({ canSudo: true });
    const rootExec = await resolveRootExecutor(stub.exec);
    const target = "/var/lib/vibrail/app-config/proj_123/cli-proxy-api/CLIProxyAPI/config.yaml";

    await rootExec.writeFile(target, "host: 0.0.0.0\n");

    expect(stub.writes).toHaveLength(1);
    expect(stub.writes[0]?.path).toMatch(/^\/tmp\/\.vibrail-elev-/);
    expect(stub.writes[0]?.content).toBe("host: 0.0.0.0\n");
    expect(
      stub.commands.some(
        (command) => command.startsWith("sudo -n sh -c ") && command.includes(target),
      ),
    ).toBe(true);
  });

  it("fails writes with an actionable error when the SSH user cannot elevate", async () => {
    const stub = nonRootExecutor({ canSudo: false });

    await expect(writeVibrailFile(stub.exec, "mail-state.json", "state")).rejects.toThrow(
      "requires root or passwordless sudo",
    );
  });
});
