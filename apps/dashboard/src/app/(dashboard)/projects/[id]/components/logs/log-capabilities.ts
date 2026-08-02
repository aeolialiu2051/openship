export interface ProjectLogCapabilityInput {
  activeDeploymentId?: string | null;
  deployTarget?: string | null;
  effectiveHasServer: boolean;
  hasServices: boolean;
}

/**
 * Resolve which log sources exist for the active project shape.
 *
 * `hasServer=false` describes the application build (static output), not the
 * deployment runtime. A self-hosted static app is served by a running nginx
 * container and therefore has normal Docker stdout/stderr to stream.
 */
export function resolveProjectLogCapabilities(input: ProjectLogCapabilityInput) {
  const hasStaticContainerRuntime =
    !input.effectiveHasServer &&
    !input.hasServices &&
    Boolean(input.activeDeploymentId) &&
    input.deployTarget !== "cloud";

  const hasProjectRuntime =
    !input.hasServices && (input.effectiveHasServer || hasStaticContainerRuntime);
  const canShowRequestLogs = input.deployTarget === "cloud";
  const canShowRuntimeLogs = hasProjectRuntime || input.hasServices;

  return {
    hasStaticContainerRuntime,
    hasProjectRuntime,
    canShowRequestLogs,
    canShowRuntimeLogs,
    canShowLogs: canShowRuntimeLogs || canShowRequestLogs,
    canShowTerminal: canShowRuntimeLogs,
    isRequestLogsOnly: canShowRequestLogs && !canShowRuntimeLogs,
  };
}
