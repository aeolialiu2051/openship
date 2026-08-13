/**
 * Determine whether a project has no runtime server.
 *
 * Compose/service projects are server-backed by definition. Early compose
 * imports persisted app-level static defaults even though their service rows
 * were running and exposed; the derived service shape must win over those
 * stale fields.
 */
export function isStaticProjectRuntime(
  project: {
    hasServer?: boolean | null;
    productionMode?: string | null;
    projectType?: string | null;
    framework?: string | null;
    serviceCount?: number | null;
  },
): boolean {
  if (
    project.projectType === "services" ||
    project.framework === "docker-compose" ||
    (project.serviceCount ?? 0) > 0
  ) {
    return false;
  }
  if (project.hasServer != null) return project.hasServer === false;
  return project.productionMode === "static";
}
