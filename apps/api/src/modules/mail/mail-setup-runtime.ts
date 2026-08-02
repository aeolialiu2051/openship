/**
 * Runtime paths and shell-command builders shared by the mail setup steps.
 * Kept dependency-free so privilege and command-safety behavior can be tested
 * without booting the API/database runtime.
 */

export const MAIL_ENGINE_REMOTE_DIR = "/tmp/vibrail-iredmail-engine";

export function buildAptGetCommand(args: string): string {
  return `DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=180 ${args}`;
}

/**
 * Read the server's current FQDN without making hostname resolution a setup
 * prerequisite. Fresh cloud images commonly have a hostname that is not yet
 * present in /etc/hosts, causing `hostname -f` to exit non-zero. The mail setup
 * fixes that mapping in the following step, so an unresolved current hostname
 * must be treated as "unknown" rather than aborting the installation.
 */
export async function readCurrentFqdn(
  execCommand: (command: string) => Promise<string>,
): Promise<string | null> {
  try {
    return (await execCommand("hostname -f")).trim() || null;
  } catch {
    return null;
  }
}

export type MailInstallHealth = "absent" | "partial" | "complete";

/**
 * Classify the mail stack using both daemon state and its required database
 * objects. Postfix and Dovecot can be active halfway through an interrupted
 * iRedMail run, so service state alone is not proof of a usable installation.
 */
export function classifyMailInstallHealth(input: {
  postfixActive: boolean;
  dovecotActive: boolean;
  vmailSchemaReady: boolean;
  postmasterReady: boolean;
}): MailInstallHealth {
  if (
    input.postfixActive &&
    input.dovecotActive &&
    input.vmailSchemaReady &&
    input.postmasterReady
  ) {
    return "complete";
  }
  if (
    !input.postfixActive &&
    !input.dovecotActive &&
    !input.vmailSchemaReady &&
    !input.postmasterReady
  ) {
    return "absent";
  }
  return "partial";
}

export type AcmeChallengeMode = "standalone" | "webroot" | "blocked";

export function chooseAcmeChallengeMode(input: {
  port80Listening: boolean;
  port80BlockedByForeignProxy: boolean;
}): AcmeChallengeMode {
  if (input.port80BlockedByForeignProxy) return "blocked";
  return input.port80Listening ? "webroot" : "standalone";
}
