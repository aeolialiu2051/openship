import type { CloneStrategy, DeployTarget } from "@/context/deployment/types";

interface ComingSoonSelection {
  deployTarget: DeployTarget;
  cloneStrategy: CloneStrategy;
  isDesktop: boolean;
  showCloneStrategy: boolean;
}

export function isDeploySelectionComingSoon({
  deployTarget,
  cloneStrategy,
  isDesktop,
  showCloneStrategy,
}: ComingSoonSelection): boolean {
  if (deployTarget === "cloud") return true;

  return !isDesktop && showCloneStrategy && cloneStrategy === "api-host";
}
