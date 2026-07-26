import { appendProjectRouteKey, resolveServiceHostnameLabel, slugify } from "@repo/core";

/** Canonical managed label stored on an App template's service route. */
export function appServiceManagedLabel(input: {
  projectLabel: string;
  serviceName: string;
  routeKey?: string | null;
  slugSuffix?: string;
}): string {
  const projectLabel = slugify(input.projectLabel) || "project";
  const serviceLabel = slugify(input.serviceName);
  const defaultLabel = serviceLabel === projectLabel
    ? projectLabel
    : resolveServiceHostnameLabel(
        projectLabel,
        input.serviceName,
        undefined,
        "compose",
      );
  const rawLabel = input.slugSuffix
    ? `${defaultLabel}-${input.slugSuffix}`
    : defaultLabel;
  return input.routeKey
    ? appendProjectRouteKey(rawLabel, input.routeKey)
    : rawLabel;
}
