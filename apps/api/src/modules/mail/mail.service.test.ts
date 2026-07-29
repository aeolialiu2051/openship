import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildAptGetCommand,
  chooseAcmeChallengeMode,
  MAIL_ENGINE_REMOTE_DIR,
} from "./mail-setup-runtime";

describe("mail setup command safety", () => {
  it("waits for transient apt locks during update and upgrade", async () => {
    const commands = [buildAptGetCommand("update -y"), buildAptGetCommand("-y upgrade")];

    expect(commands).toHaveLength(2);
    expect(commands[0]).toContain("DPkg::Lock::Timeout=180");
    expect(commands[1]).toContain("DPkg::Lock::Timeout=180");
  });

  it("stages the engine outside /root so a non-root SSH user can upload it", async () => {
    expect(MAIL_ENGINE_REMOTE_DIR).toBe("/tmp/openship-iredmail-engine");
    expect(MAIL_ENGINE_REMOTE_DIR.startsWith("/root/")).toBe(false);
  });

  it("preserves an existing HTTPS proxy when port 80 is free", () => {
    expect(
      chooseAcmeChallengeMode({
        port80Listening: false,
        port80BlockedByForeignProxy: false,
      }),
    ).toBe("standalone");
  });

  it("uses webroot for a known listener and blocks a foreign port-80 proxy", () => {
    expect(
      chooseAcmeChallengeMode({
        port80Listening: true,
        port80BlockedByForeignProxy: false,
      }),
    ).toBe("webroot");
    expect(
      chooseAcmeChallengeMode({
        port80Listening: true,
        port80BlockedByForeignProxy: true,
      }),
    ).toBe("blocked");
  });

  it("runs the reviewed vendored engine without the upstream latest-version refusal", () => {
    const serviceSource = readFileSync(resolve(import.meta.dirname, "mail.service.ts"), "utf8");
    const versionGate = readFileSync(
      resolve(import.meta.dirname, "../../../../email/engine/pkgs/get_all.sh"),
      "utf8",
    );

    expect(serviceSource).toContain('"OPENSHIP_VENDORED_ENGINE=YES"');
    expect(serviceSource).toContain("The staged mail engine is older than the current Openship build.");
    expect(serviceSource).toContain("await stepTransferEngine(exec, domain");
    expect(versionGate).toContain('[ X"${OPENSHIP_VENDORED_ENGINE}" == X\'YES\' ]');
    expect(versionGate).toContain('status_check_new_iredmail="DONE"');
  });
});
