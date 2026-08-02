import type { RuntimeMode } from "@repo/core";

export interface WorkloadRuntimeSnapshot {
  runtimeMode?: RuntimeMode;
  adopt?: boolean;
  /** Internal marker stamped only on the Openship control plane self-app. */
  controlPlaneAdopt?: boolean;
}

/**
 * User workloads on local/self-hosted servers are always containerized. The
 * sole bare exception is the control plane's internal adopt deployment: it
 * represents the already-running Openship process and must never start a
 * second container/process for it.
 */
export function resolveServerWorkloadRuntimeMode(
  snapshot: WorkloadRuntimeSnapshot,
): RuntimeMode {
  return snapshot.controlPlaneAdopt === true &&
    snapshot.adopt === true &&
    snapshot.runtimeMode === "bare"
    ? "bare"
    : "docker";
}
