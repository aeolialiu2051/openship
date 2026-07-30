import { safeErrorMessage } from "@repo/core";
import type { CommandExecutor, LogEntry } from "../types";
import { systemCatalog } from "./catalog";
import { elevatedExecutor } from "./elevated-executor";
import { resolveEnvironment, type EnvironmentProfile } from "./environment";
import { sq } from "./local-shell";
import type { InstallerConfig, InstallResult, SystemLog, SystemLogCallback } from "./types";

function log(message: string, level: SystemLog["level"] = "info"): SystemLog {
  return { timestamp: new Date().toISOString(), message, level };
}

type ExecutorPrep =
  | { ok: true; executor: CommandExecutor; profile: EnvironmentProfile }
  | { ok: false; result: InstallResult };

async function prepareExecutor(
  executor: CommandExecutor,
  component: string,
): Promise<ExecutorPrep> {
  const profile = await resolveEnvironment(executor);
  if (profile.isRoot) return { ok: true, executor, profile };
  if (profile.canSudo) return { ok: true, executor: elevatedExecutor(executor), profile };
  return {
    ok: false,
    result: {
      component,
      success: false,
      error: `Installing ${component} needs root. Connect this server as root, or as a user with passwordless sudo.`,
    },
  };
}

type InstallableName = keyof typeof systemCatalog.installs;

async function installPackage(
  name: InstallableName,
  executor: CommandExecutor,
  onLog: SystemLogCallback,
): Promise<InstallResult> {
  const loginUser = name === "docker"
    ? (await executor.exec("id -un")).trim()
    : null;
  const prep = await prepareExecutor(executor, name);
  if (!prep.ok) return prep.result;
  const plan = systemCatalog.installs[name](prep.profile);
  if (!plan.supported || !plan.installCommand || !plan.verifyCommand) {
    return { component: name, success: false, error: plan.unsupportedReason ?? `${name} install not supported` };
  }

  onLog(log(`Installing ${name}...`));
  try {
    const { code } = await prep.executor.streamExec(
      plan.installCommand,
      onLog as (entry: LogEntry) => void,
    );
    if (code !== 0) return { component: name, success: false, error: `${name} installation failed` };
    if (plan.startCommand) {
      const start = await prep.executor.streamExec(
        plan.startCommand,
        onLog as (entry: LogEntry) => void,
      );
      if (start.code !== 0) {
        const message = `${name} installed but failed to start`;
        onLog(log(message, "error"));
        return { component: name, success: false, error: message };
      }
    }
    const version = await prep.executor.exec(plan.verifyCommand);
    const parsed = systemCatalog.checks[name].parseVersion(version);

    if (name === "docker" && loginUser && loginUser !== "root") {
      const grantAccessCommand =
        "getent group docker >/dev/null 2>&1 && " +
        `if command -v usermod >/dev/null 2>&1; then usermod -aG docker ${sq(loginUser)}; ` +
        `elif command -v addgroup >/dev/null 2>&1; then addgroup ${sq(loginUser)} docker; ` +
        "else exit 1; fi";
      const access = await prep.executor.streamExec(
        grantAccessCommand,
        onLog as (entry: LogEntry) => void,
      );
      if (access.code !== 0) {
        const message = `Docker is running, but access could not be granted to ${loginUser}`;
        onLog(log(message, "error"));
        return { component: name, success: false, error: message };
      }
      onLog(log(`Granted ${loginUser} access to the Docker socket`));
    }

    // A successful package command is not enough for service-backed tools.
    // Wait for the service to become usable before reporting installation done.
    if (plan.healthCommand) {
      try {
        await prep.executor.exec(plan.healthCommand);
      } catch {
        const message = plan.healthError ?? `${name} installed but is not healthy`;
        onLog(log(message, "error"));
        return { component: name, success: false, error: message };
      }
    }

    onLog(log(`${name} ${parsed} installed`));
    return { component: name, success: true, version: parsed };
  } catch (error) {
    const message = safeErrorMessage(error);
    onLog(log(`${name} installation failed: ${message}`, "error"));
    return { component: name, success: false, error: message };
  }
}

export const installDocker = (executor: CommandExecutor, onLog: SystemLogCallback) =>
  installPackage("docker", executor, onLog);
export const installGit = (
  executor: CommandExecutor,
  onLog: SystemLogCallback,
  _opts?: { label?: string },
) => installPackage("git", executor, onLog);
export const installRsync = (executor: CommandExecutor, onLog: SystemLogCallback) =>
  installPackage("rsync", executor, onLog);
export const installCertbot = (executor: CommandExecutor, onLog: SystemLogCallback) =>
  installPackage("certbot", executor, onLog);

function buildRemoveCommand(pm: EnvironmentProfile["packageManager"], name: string): string | null {
  switch (pm) {
    case "apt": return `apt-get purge -y -qq ${name} && apt-get autoremove -y -qq`;
    case "dnf": return `dnf remove -y ${name}`;
    case "yum": return `yum remove -y ${name}`;
    case "brew": return `brew uninstall --force ${name}`;
    case "apk": return `apk del ${name}`;
    default: return null;
  }
}

async function uninstallPackage(
  name: "certbot" | "rsync",
  executor: CommandExecutor,
  onLog: SystemLogCallback,
): Promise<InstallResult> {
  const prep = await prepareExecutor(executor, name);
  if (!prep.ok) return prep.result;
  const command = buildRemoveCommand(prep.profile.packageManager, name);
  if (!command) return { component: name, success: false, error: `${name} removal not supported` };
  try {
    const { code } = await prep.executor.streamExec(command, onLog as (entry: LogEntry) => void);
    return code === 0
      ? { component: name, success: true }
      : { component: name, success: false, error: `${name} removal failed` };
  } catch (error) {
    return { component: name, success: false, error: safeErrorMessage(error) };
  }
}

export const uninstallCertbot = (executor: CommandExecutor, onLog: SystemLogCallback) =>
  uninstallPackage("certbot", executor, onLog);
export const uninstallRsync = (executor: CommandExecutor, onLog: SystemLogCallback) =>
  uninstallPackage("rsync", executor, onLog);

export async function getRemovalSupport(
  executor: CommandExecutor,
  componentName: string,
): Promise<{ supported: boolean; reason?: string }> {
  const profile = await resolveEnvironment(executor);
  return buildRemoveCommand(profile.packageManager, componentName)
    ? { supported: true }
    : { supported: false, reason: `No package manager to remove ${componentName}` };
}

type InstallerFn = (
  executor: CommandExecutor,
  onLog: SystemLogCallback,
  config?: InstallerConfig,
) => Promise<InstallResult>;

export const COMPONENT_INSTALLERS: Record<string, InstallerFn> = {
  docker: installDocker,
  certbot: installCertbot,
  git: (executor, onLog) => installGit(executor, onLog),
  rsync: installRsync,
};

export const COMPONENT_UNINSTALLERS: Record<string, InstallerFn> = {
  certbot: uninstallCertbot,
  rsync: uninstallRsync,
};
