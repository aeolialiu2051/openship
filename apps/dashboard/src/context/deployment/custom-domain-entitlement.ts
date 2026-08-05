import type { CustomDomainProjectQuota } from "@/lib/api";
import { usesServiceDeployment, type DeploymentConfig } from "./types";

export function deploymentUsesCustomDomain(config: DeploymentConfig) {
  if (usesServiceDeployment(config)) {
    return config.services.some((service) =>
      service.exposed && (
        service.publicEndpoints?.some(
          (endpoint) => endpoint.domainType === "custom" && Boolean(endpoint.customDomain.trim()),
        ) ||
        (service.domainType === "custom" && Boolean(service.customDomain?.trim()))
      ),
    );
  }

  if (config.projectType === "monorepo") {
    return config.monorepoApps?.some((app) =>
      app.enabled && app.publicEndpoints.some(
        (endpoint) => endpoint.domainType === "custom" && Boolean(endpoint.customDomain.trim()),
      ),
    ) ?? false;
  }

  return !config.noPublicRoute && config.publicEndpoints.some(
    (endpoint) => endpoint.domainType === "custom" && Boolean(endpoint.customDomain.trim()),
  );
}

export function findCustomDomainProjectConflict(
  config: DeploymentConfig,
  quota: CustomDomainProjectQuota | null,
) {
  if (!quota || quota.limit !== 1 || !deploymentUsesCustomDomain(config)) return null;
  return quota.claimedProjects.find((project) => project.projectId !== config.projectId) ?? null;
}
