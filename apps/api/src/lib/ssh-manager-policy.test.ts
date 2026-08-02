import { describe, expect, it } from "vitest";
import { isCloudSafeSshSettings, type SshSettingsInput } from "./ssh-manager";

const settings = (overrides: Partial<SshSettingsInput> = {}): SshSettingsInput => ({
  sshHost: "server.example.com",
  sshAuthMethod: "password",
  sshPassword: "secret",
  ...overrides,
});

describe("isCloudSafeSshSettings", () => {
  it("allows tenant-owned passwords and uploaded private keys", () => {
    expect(isCloudSafeSshSettings(settings())).toBe(true);
    expect(
      isCloudSafeSshSettings(
        settings({
          sshAuthMethod: "key",
          sshPassword: null,
          sshKeyPath: "inline-key:enc1:encrypted",
        }),
      ),
    ).toBe(true);
  });

  it("rejects access to control-plane SSH facilities", () => {
    expect(isCloudSafeSshSettings(settings({ sshAuthMethod: "agent" }))).toBe(false);
    expect(isCloudSafeSshSettings(settings({ sshKeyPath: "/root/.ssh/id_ed25519" }))).toBe(false);
    expect(isCloudSafeSshSettings(settings({ sshJumpHost: "bastion.internal" }))).toBe(false);
    expect(isCloudSafeSshSettings(settings({ sshArgs: "-o ProxyCommand=evil" }))).toBe(false);
  });
});
