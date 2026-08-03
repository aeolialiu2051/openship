import type { CommandExecutor, DeployConfig } from "@repo/adapters";
import { resolveRootExecutor } from "../../../lib/vibrail-server-store";

/** Root-owned host storage shared with the self-hosted webmail container. */
export const WEBMAIL_PERSIST_DIR = "/var/lib/vibrail-webmail";
export const WEBMAIL_BRANDING_DIR = `${WEBMAIL_PERSIST_DIR}/branding`;
export const WEBMAIL_SQLITE_PATH = `${WEBMAIL_PERSIST_DIR}/zero.db`;

/**
 * Trusted bind mounts for the managed webmail app. This is intentionally not
 * sourced from project configuration: ordinary projects must not be able to
 * request arbitrary host-path mounts.
 */
export const WEBMAIL_BIND_MOUNTS: NonNullable<DeployConfig["bindMounts"]> = [
  { source: WEBMAIL_PERSIST_DIR, target: WEBMAIL_PERSIST_DIR },
];

/** Return mounts only for the immutable managed-app identity on self-hosted Docker. */
export function managedWebmailBindMounts(input: {
  isApp: boolean;
  appTemplateId: string | null;
  framework: string;
  isSelfHostedDocker: boolean;
}): DeployConfig["bindMounts"] {
  if (
    !input.isApp ||
    input.appTemplateId !== "mail-webmail" ||
    input.framework !== "webmail" ||
    !input.isSelfHostedDocker
  ) {
    return undefined;
  }
  return WEBMAIL_BIND_MOUNTS.map((mount) => ({ ...mount }));
}

/** Prepare root-owned persistence for root and passwordless-sudo SSH users. */
export async function ensureWebmailPersistence(exec: CommandExecutor): Promise<void> {
  const rootExec = await resolveRootExecutor(exec);
  await rootExec.mkdir(WEBMAIL_PERSIST_DIR);
  await rootExec.exec(`chmod 0750 ${WEBMAIL_PERSIST_DIR}`);
  await rootExec.mkdir(WEBMAIL_BRANDING_DIR);
  await rootExec.exec(`chmod 0750 ${WEBMAIL_BRANDING_DIR}`);
}

/** Best-effort teardown calls this through the same privilege boundary. */
export async function removeWebmailBranding(exec: CommandExecutor): Promise<void> {
  const rootExec = await resolveRootExecutor(exec);
  await rootExec.rm(WEBMAIL_BRANDING_DIR);
}
