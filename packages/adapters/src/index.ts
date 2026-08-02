/**
 * @repo/adapters - platform abstraction layer.
 *
 * Three layers, one entry point:
 *   1. Runtime  → build/deploy/stop/start lifecycle (Docker, Bare, Cloud)
 *   2. Infra    → shared Traefik routing plus cloud/BYO certificate providers
 *   3. System   → prerequisite checks + setup validation (self-hosted only)
 *
 * The Platform ties them together:
 *   const { runtime, routing, ssl, system } = getPlatform();
 */

// ─── Shared types ────────────────────────────────────────────────────────────
export type {
  ResourceConfig,
  ContainerStatus,
  BuildStrategy,
  BuildConfig,
  DeployPublicEndpoint,
  TraefikRouteConfig,
  TraefikRouteRuleConfig,
  TraefikEdgeConfig,
  DeployConfig,
  BuildResult,
  DeploymentResult,
  BuildStep,
  LogEntry,
  LogCallback,
  ContainerInfo,
  ResourceUsage,
  RouteConfig,
  RouteProxyLocation,
  RouteRedirect,
  RouteHeaderRule,
  SslResult,
  ManualCert,
  SshConfig,
  CommandExecutor,
  ShellOptions,
  ShellSession,
  ProvisionLock,
  AmbientGitVia,
} from "./types";

// The one clone-command assembler (token / relay / ssh / ambient) + its shell
// quoting, shared with the API so a probe and the clone it predicts can't drift.
export {
  sq,
  assembleGitClone,
  injectGitToken,
  toGitHubSshUrl,
  type GitCloneAuth,
  type GitCloneInvocation,
} from "./runtime/git-clone";

export { BUILD_STEPS } from "./types";

export { DEFAULT_RESOURCE_CONFIG, DEFAULT_BUILD_RESOURCE_CONFIG } from "./types";

// ─── Runtime layer ───────────────────────────────────────────────────────────
export type {
  RuntimeAdapter,
  RuntimeCapability,
  MultiServiceRuntimeAdapter,
  MultiServiceGroupHandle,
  MultiServiceDeployConfig,
  MultiServiceDeployResult,
  DeploymentRef,
  RollbackInput,
  MakeActiveResult,
  DockerMount,
  DockerPortBinding,
  DockerContainerSummary,
  DockerContainerDetail,
  DockerVolumeInfo,
  DockerNetworkInfo,
  TraefikManualConfig,
  ResolvedTraefikEdge,
} from "./runtime/types";
export { assertCapability, isMultiServiceRuntime } from "./runtime/types";
export { DockerRuntime, type DockerConnectionOptions } from "./runtime/docker";
export {
  isTraefikContainer,
  VIBRAIL_EDGE_CONTAINER,
  bareTraefikDynamicConfigPath,
} from "./runtime/traefik-edge";
export {
  transferImage,
  type ImageTransferOptions,
  type ImageTransferResult,
} from "./runtime/image-transfer";
export { BareRuntime, STATIC_RELEASE_BASE, type BareRuntimeOptions } from "./runtime/bare";
export {
  CloudRuntime,
  type CloudAdminProxy,
  PAGE_CONTAINER_PREFIX,
  provisionCloudWorkspace,
} from "./runtime/cloud";
export { BuildLogger } from "./runtime/build-pipeline";
export {
  type DeployEnvironment,
  type DeployRouting,
  type DeployPipelineInput,
  type DeployPipelineResult,
  type PromptPayload,
  type PromptUserFn,
  runDeployPipeline,
} from "./runtime/deploy-pipeline";
export {
  type RoutedDomainInput,
  type RouteRegistrationOptions,
  registerResolvedRoutes,
} from "./runtime/route-registration";
export {
  type PortOccupant,
  probeListeningPort,
  ensurePortAvailable,
} from "./runtime/port-conflict";
export { allocateHostPort, pickHostPort, type AllocateHostPortOptions } from "./runtime/host-port";
export { type RuntimeMode, type CreateRuntimeOptions, createRuntime } from "./runtime/index";
export { resolveDockerfileCandidates } from "./runtime/docker-paths";
export { scopedVolumeName, scopeVolumeBinds, isHostPathSource } from "./runtime/volume-namespace";

// ─── Infrastructure layer ────────────────────────────────────────────────────
export type { RoutingProvider, SslProvider } from "./infra/types";
export {
  compileVercelRouting,
  sourceToLocation,
  type CompiledRouting,
  type CompiledRedirect,
  type CompiledHeaderRule,
} from "./infra/vercel-routing";
export { compileRoutingToOblien, type OblienRoutingContext } from "./runtime/oblien-routing";
export { CloudInfraProvider } from "./infra/cloud";
export { NoopInfraProvider } from "./infra/noop";

// ─── System layer ────────────────────────────────────────────────────────────
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
  RuntimeMode as SystemRuntimeMode,
  SystemComponentDefinition,
  SetupResult,
  SystemCheckResult,
  SystemLog,
  SystemLogCallback,
} from "./system/types";
export type { ImportedSite, ProxyScanResult } from "./system/types";
export { classifyProxy, probeEdge } from "./system/proxy/detect";
export { scanImportableSites, canImportProxy } from "./system/proxy/import";

export type { SetupState, SetupStateStore, ComponentState } from "./system/state";
export { FileStateStore } from "./system/state";

export type {
  EnvironmentProfile,
  LinuxDistro,
  SystemArch,
  SystemOs,
  SystemPackageManager,
  SystemServiceManager,
} from "./system/environment";
export { resolveEnvironment, detectPrivilege } from "./system/environment";
export { elevatedExecutor, elevateCommand } from "./system/elevated-executor";
export { systemCatalog } from "./system/catalog";
export { SYSTEM_COMPONENTS, getSystemComponentDefinition } from "./system/components";
export {
  isRemoteConnectionError,
  isRetryableRemoteConnectionError,
  isSshAuthError,
  isRuntimeNotFoundError,
  isSshDisconnectedError,
  SshDisconnectedError,
} from "./system/errors";
export { probeTcp, probeHttp, waitForReady } from "./system/reachability";
export {
  parseListeningPorts,
  probePortListeningOnce,
  waitForPortListening,
  type PortProbeExecutor,
  type PortProbeResult,
} from "./system/port-listen";
export {
  scanPorts,
  parseSsListeners,
  parseProcNetListeners,
  isLoopbackAddress,
  describeService,
  type PortScanExecutor,
  type PortScanResult,
  type HostListener,
  type PortProto,
  type PortFamily,
} from "./system/port-scan";
export { probeStaticOutput, type OutputProbeResult } from "./system/output-exists";

export {
  LocalExecutor,
  SshExecutor,
  SystemSshExecutor,
  createExecutor,
  createHostExecutor,
} from "./system/executor";
export {
  ensureRemoteJournal,
  runJournaled,
  runReliable,
  execReliable,
  parseFrame,
  OpInterruptedError,
  VIBRAIL_RUN_VERSION,
  REMOTE_ENV_PREFIX,
  type JournalRunResult,
  type RunJournaledOptions,
  type ReliableRunResult,
  type RunReliableOptions,
} from "./system/remote-journal";

export {
  checkAll as checkAllComponents,
  checkComponents,
  checkCertbot,
  checkDocker,
  checkGit,
  COMPONENT_CHECKS,
} from "./system/checks";
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
} from "./system/installer";
export { SystemManager, type SystemManagerOptions } from "./system/setup";

// ─── Toolchain layer ────────────────────────────────────────────────────────
export type {
  ToolchainStatus,
  ToolchainCheckResult,
  ToolchainCheckEntry,
  ToolchainInstallPlan,
  ToolchainInstallResult,
} from "./toolchain";

export { toolchainCatalog } from "./toolchain";
export { checkTool, checkTools, checkToolchain, checkToolchainForStack } from "./toolchain";
export { installTool, installTools } from "./toolchain";

// ─── Dockerfile planning ────────────────────────────────────────────────────
export type {
  CompileDockerfileOptions,
  DockerfileCommandForm,
  DockerfileInstruction,
  DockerfileInstructionKeyword,
  DockerfileParseResult,
  WorkspaceBuildPlan,
  WorkspaceBuildStagePlan,
  WorkspaceCommand,
  WorkspaceCopyStep,
  WorkspaceExposedPort,
  WorkspacePlanDiagnostic,
  WorkspacePlanSeverity,
  WorkspaceRuntimePlan,
  WorkspaceRunStep,
  WorkspaceStageStep,
} from "./dockerfile";
export {
  compileDockerfileParseResult,
  compileDockerfileToWorkspacePlan,
  parseDockerfile,
} from "./dockerfile";

// ─── Platform (top-level entry point) ────────────────────────────────────────
export type { PlatformTarget, PlatformConfig, Platform } from "./platform";
export { createPlatform, initPlatform, getPlatform, resetPlatform } from "./platform";

// ─── Oblien SDK (re-export for single source of truth) ───────────────────────
export { Oblien } from "oblien";
export type {
  NamespaceUsageUnits,
  NamespaceUsageUnitBucket,
  NamespaceUsageUnitsParams,
} from "oblien";

// ─── Backup adapters (importing the index seeds all three registries) ───────
export * from "./backup";
