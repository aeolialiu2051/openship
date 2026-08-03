import { projectRoutingSlug } from "@repo/core";

type WebmailRouteProject = {
  slug: string;
  routeKey?: string | null;
};

export type WebmailPublicEndpoint = {
  port: number;
  domain?: string;
  customDomain?: string;
  domainType: "free" | "custom";
};

/**
 * Every user workload receives its stable managed route. A custom hostname is
 * additive: it must never replace the route-keyed fallback, otherwise pending
 * DNS ownership verification leaves a successfully deployed app unreachable.
 */
export function webmailPublicEndpoints(
  project: WebmailRouteProject,
  port: number,
  customHostname?: string,
  managedDomain?: string,
): WebmailPublicEndpoint[] {
  const endpoints: WebmailPublicEndpoint[] = [
    {
      port,
      domain: managedDomain || projectRoutingSlug(project),
      domainType: "free",
    },
  ];

  const customDomain = customHostname?.trim().toLowerCase();
  if (customDomain) {
    endpoints.push({ port, customDomain, domainType: "custom" });
  }
  return endpoints;
}
