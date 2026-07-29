export interface RollbackAvailabilityDeployment {
  status: string;
  isActive?: boolean;
  rollbackStrategy?: "snapshot" | "git";
  artifactRetainedAt?: string | null;
  commit?: {
    fullHash?: string | null;
  };
}

export interface RollbackAvailability {
  canRollback: boolean;
  canRedeployCommit: boolean;
  isInFlight: boolean;
}

/**
 * Resolve dashboard rollback actions from the deployment snapshot returned by
 * the API. Git rollbacks rebuild the recorded commit and therefore do not need
 * an archived artifact; snapshot rollbacks do.
 */
export function getRollbackAvailability(
  deployment: RollbackAvailabilityDeployment,
): RollbackAvailability {
  const isInFlight = ["pending", "queued", "building", "deploying"].includes(
    deployment.status,
  );
  const isSuccessful = ["success", "ready", "partial_failure"].includes(
    deployment.status,
  );
  const fullHash = deployment.commit?.fullHash;
  const hasCommit = !!fullHash && fullHash !== "N/A";
  const hasRollbackSource =
    deployment.rollbackStrategy === "git" ? hasCommit : !!deployment.artifactRetainedAt;
  const canRollback = isSuccessful && !deployment.isActive && hasRollbackSource;

  return {
    canRollback,
    canRedeployCommit: !canRollback && !deployment.isActive && !isInFlight && hasCommit,
    isInFlight,
  };
}
