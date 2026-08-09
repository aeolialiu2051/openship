import type { Project } from "@/constants/mock";

/**
 * Determine whether a project has no runtime server.
 *
 * `hasServer` is the current, authoritative field. Some older or reconfigured
 * projects can retain a stale `productionMode`, so it must only be used as a
 * compatibility fallback when `hasServer` is absent.
 */
export function isStaticProjectRuntime(
  project: Pick<Project, "hasServer" | "productionMode">,
): boolean {
  if (project.hasServer != null) return project.hasServer === false;
  return project.productionMode === "static";
}
