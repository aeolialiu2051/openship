import { isServicesFramework } from "@repo/core";

export interface ProjectRuntimeVisibilityInput {
  containerId?: string | null;
  framework?: string | null;
  serviceKinds: Array<string | null | undefined>;
}

/**
 * Single-app projects own a project-level runtime container. Service-first
 * Compose projects and monorepos already model their app containers as service
 * rows, so adding a synthetic project runtime would duplicate the main app.
 */
export function shouldExposeProjectRuntime(input: ProjectRuntimeVisibilityInput): boolean {
  return Boolean(
    input.containerId &&
      !isServicesFramework(input.framework) &&
      !input.serviceKinds.some((kind) => kind === "monorepo"),
  );
}
