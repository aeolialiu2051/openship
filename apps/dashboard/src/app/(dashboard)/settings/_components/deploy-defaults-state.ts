import type { DefaultDeployTarget } from "@/lib/api/settings";

export type DeployTargetClickIntent =
  | { kind: "open-server-picker" }
  | { kind: "coming-soon" }
  | {
      kind: "save-target";
      target: Exclude<DefaultDeployTarget, "server" | "cloud">;
      serverId: null;
    };

export function resolveDeployTargetClick(target: DefaultDeployTarget): DeployTargetClickIntent {
  if (target === "server") {
    return { kind: "open-server-picker" };
  }

  if (target === "cloud") {
    return { kind: "coming-soon" };
  }

  return { kind: "save-target", target, serverId: null };
}

export function displayedDeployTarget(
  savedTarget: DefaultDeployTarget | null,
  choosingServer: boolean,
): DefaultDeployTarget | null {
  if (choosingServer) return "server";

  // Older versions allowed Cloud to be persisted even though the managed
  // deployment path is not available yet. Do not present that stale value as
  // an active, usable default.
  return savedTarget === "cloud" ? null : savedTarget;
}
