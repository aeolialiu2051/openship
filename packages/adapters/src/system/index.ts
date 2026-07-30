/**
 * System layer barrel exports.
 */

export type {
  EnvironmentProfile,
  LinuxDistro,
  SystemArch,
  SystemOs,
  SystemPackageManager,
  SystemServiceManager,
} from "./environment";
export { resolveEnvironment, detectPrivilege } from "./environment";

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  ComponentStatus,
  EdgeClassification,
  EdgeOccupant,
  EdgeStatus,
  Feature,
  FeatureReadiness,
  InstallerConfig,
  InstallResult,
  PrerequisiteRule,
  ProxyKind,
  RuntimeMode,
  SetupResult,
  SystemCheckResult,
  SystemLog,
  SystemLogCallback,
} from "./types";

// ─── Edge preflight + takeover ──────────────────────────────────────────────────
export { classifyProxy, probeEdge } from "./proxy/detect";
export type { ImportedSite, ProxyScanResult } from "./types";
export { scanImportableSites, canImportProxy } from "./proxy/import";

// ─── State ───────────────────────────────────────────────────────────────────
export type { SetupState, SetupStateStore, ComponentState } from "./state";
export { FileStateStore } from "./state";

// ─── Executor ────────────────────────────────────────────────────────────────
export { LocalExecutor, SshExecutor, SystemSshExecutor, createExecutor } from "./executor";
// Privilege elevation for non-root SSH users (component installs use it; the
// broader remote-exec surface can adopt it as a follow-up — see #84).
export { elevatedExecutor, elevateCommand } from "./elevated-executor";

// ─── Checks ──────────────────────────────────────────────────────────────────
export {
  checkAll,
  checkComponents,
  checkCertbot,
  checkDocker,
  checkGit,
  checkRsync,
  COMPONENT_CHECKS,
} from "./checks";

// ─── Installers ───────────────────────────────────────────────────────────────
export {
  COMPONENT_INSTALLERS,
  COMPONENT_UNINSTALLERS,
  getRemovalSupport,
  installCertbot,
  installDocker,
  installGit,
  installRsync,
  uninstallCertbot,
  uninstallRsync,
} from "./installer";

// ─── Manager ─────────────────────────────────────────────────────────────────
export { SystemManager, type SystemManagerOptions } from "./setup";
