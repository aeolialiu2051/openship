import { STACKS, type StackId } from "@repo/core";

/** Framework metadata without the dashboard-only React icon dependency. */
export function getFrameworkConfig(frameworkId?: string | null) {
  const framework = frameworkId ? STACKS[frameworkId as StackId] : undefined;
  return { id: frameworkId || "unknown", name: framework?.name || STACKS.static.name };
}
