import { STACKS, type StackId } from "@repo/core";

/** Framework metadata without the dashboard-only React icon dependency. */
export function getFrameworkConfig(frameworkId?: string | null) {
  const framework = frameworkId ? STACKS[frameworkId as StackId] : undefined;
  return {
    id: frameworkId || "unknown",
    name: framework?.name || STACKS.static.name,
    category: framework?.category || STACKS.unknown.category,
  };
}

/** Whether a stack normally renders a browser UI suitable for Collection previews. */
export function hasVisualPreview(frameworkId?: string | null) {
  const category = getFrameworkConfig(frameworkId).category;
  return category === "frontend" || category === "fullstack" || category === "static";
}
