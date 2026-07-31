import { isServicesFramework } from "@repo/core";

export type SavedProjectType = "app" | "docker" | "services" | "monorepo";

/**
 * Resolve the deployment shape of an already-saved project. Service rows are
 * the strongest signal, but a first MCP/API Compose import may be opened before
 * those rows have been seeded, so the detected framework must remain
 * authoritative over the API's generic single-app fallback.
 */
export function resolveSavedProjectType({
  framework,
  projectType,
  hasMonorepoRows,
  hasComposeRows,
}: {
  framework?: string | null;
  projectType?: SavedProjectType | null;
  hasMonorepoRows: boolean;
  hasComposeRows: boolean;
}): SavedProjectType {
  if (hasMonorepoRows) return "monorepo";
  if (hasComposeRows || isServicesFramework(framework)) return "services";
  return projectType || "app";
}
