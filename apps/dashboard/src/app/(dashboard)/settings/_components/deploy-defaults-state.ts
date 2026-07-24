import type { DefaultDeployTarget } from "@/lib/api/settings";

export type DeployTargetClickIntent =
  | { kind: "open-server-picker" }
  | {
      kind: "save-target";
      target: Exclude<DefaultDeployTarget, "server">;
      serverId: null;
    };

export function resolveDeployTargetClick(target: DefaultDeployTarget): DeployTargetClickIntent {
  if (target === "server") {
    return { kind: "open-server-picker" };
  }

  return { kind: "save-target", target, serverId: null };
}

export function displayedDeployTarget(
  savedTarget: DefaultDeployTarget | null,
  choosingServer: boolean,
): DefaultDeployTarget | null {
  return choosingServer ? "server" : savedTarget;
}
