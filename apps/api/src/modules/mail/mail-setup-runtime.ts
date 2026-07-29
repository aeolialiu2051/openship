/**
 * Runtime paths and shell-command builders shared by the mail setup steps.
 * Kept dependency-free so privilege and command-safety behavior can be tested
 * without booting the API/database runtime.
 */

export const MAIL_ENGINE_REMOTE_DIR = "/tmp/openship-iredmail-engine";

export function buildAptGetCommand(args: string): string {
  return `DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=180 ${args}`;
}

export type AcmeChallengeMode = "standalone" | "webroot" | "blocked";

export function chooseAcmeChallengeMode(input: {
  port80Listening: boolean;
  port80BlockedByForeignProxy: boolean;
}): AcmeChallengeMode {
  if (input.port80BlockedByForeignProxy) return "blocked";
  return input.port80Listening ? "webroot" : "standalone";
}
