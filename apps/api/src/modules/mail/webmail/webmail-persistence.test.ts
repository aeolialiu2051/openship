import { describe, expect, it } from "vitest";
import type { CommandExecutor } from "@repo/adapters";
import {
  ensureWebmailPersistence,
  managedWebmailBindMounts,
  WEBMAIL_BRANDING_DIR,
  WEBMAIL_PERSIST_DIR,
} from "./webmail-persistence";

function nonRootExecutor(canSudo: boolean) {
  const commands: string[] = [];
  const exec = {
    async exec(command: string) {
      commands.push(command);
      if (command === "id -u") return "1000";
      if (command.includes("sudo -n true")) return canSudo ? "yes" : "no";
      return "";
    },
  } as unknown as CommandExecutor;
  return { exec, commands };
}

describe("webmail host persistence", () => {
  it("creates the root-owned directories through passwordless sudo", async () => {
    const stub = nonRootExecutor(true);

    await ensureWebmailPersistence(stub.exec);

    const elevated = stub.commands.filter((command) => command.startsWith("sudo -n sh -c "));
    expect(elevated).toHaveLength(4);
    expect(elevated.some((command) => command.includes(WEBMAIL_PERSIST_DIR))).toBe(true);
    expect(elevated.some((command) => command.includes(WEBMAIL_BRANDING_DIR))).toBe(true);
  });

  it("fails with an actionable error when the SSH user cannot elevate", async () => {
    const stub = nonRootExecutor(false);

    await expect(ensureWebmailPersistence(stub.exec)).rejects.toThrow(
      "requires root or passwordless sudo",
    );
  });

  it("exposes the host mount only to the managed self-hosted webmail app", () => {
    expect(
      managedWebmailBindMounts({
        isApp: true,
        appTemplateId: "mail-webmail",
        framework: "webmail",
        isSelfHostedDocker: true,
      }),
    ).toEqual([{ source: WEBMAIL_PERSIST_DIR, target: WEBMAIL_PERSIST_DIR }]);

    expect(
      managedWebmailBindMounts({
        isApp: false,
        appTemplateId: "mail-webmail",
        framework: "webmail",
        isSelfHostedDocker: true,
      }),
    ).toBeUndefined();
    expect(
      managedWebmailBindMounts({
        isApp: true,
        appTemplateId: "other-app",
        framework: "webmail",
        isSelfHostedDocker: true,
      }),
    ).toBeUndefined();
    expect(
      managedWebmailBindMounts({
        isApp: true,
        appTemplateId: "mail-webmail",
        framework: "webmail",
        isSelfHostedDocker: false,
      }),
    ).toBeUndefined();
  });
});
