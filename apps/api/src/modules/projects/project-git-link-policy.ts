export type AppGitLinkPolicy =
  | { autoDeploy: true; installationId: number; strategy: "app" }
  | { autoDeploy: false; installationId: null; strategy: "none" };

/**
 * Repository linkage and App auto-deploy are separate capabilities. The caller
 * has already proved it can read the repository before this policy runs, so an
 * absent App installation disables push-to-deploy but never invalidates the
 * source link. Clone credentials are checked independently at deploy preflight.
 */
export function resolveAppGitLinkPolicy(
  installationId: number | null,
): AppGitLinkPolicy {
  if (installationId) {
    return { autoDeploy: true, installationId, strategy: "app" };
  }
  return { autoDeploy: false, installationId: null, strategy: "none" };
}

export function shouldEnableInitialAppAutoDeploy(input: {
  cloudMode: boolean;
  gitOwner?: string | null;
  gitRepo?: string | null;
  installationId?: number | null;
}): boolean {
  return !!(
    input.cloudMode &&
    input.gitOwner?.trim() &&
    input.gitRepo?.trim() &&
    input.installationId
  );
}
