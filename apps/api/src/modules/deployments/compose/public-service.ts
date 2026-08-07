import { resolveServiceHostnameLabel } from "@repo/core";
import type { Project } from "@repo/db";
import {
  resolveServicePort,
  serviceKind,
  type DeployableService,
} from "../../../lib/deployable-service";

/**
 * Turn an explicit public-access choice into canonical per-service routing.
 *
 * Compose routing is service-owned, so the project-level free-domain fallback
 * intentionally does not apply. This helper runs before syncFromCompose on a
 * first deployment, ensuring the selected web service is born with its route
 * while every unselected service remains private.
 */
export function applyRequestedPublicService(
  services: DeployableService[],
  project: Pick<Project, "slug" | "name">,
  publicService?: string,
  publicPort?: string,
): DeployableService[] {
  if (!publicService) {
    if (publicPort) throw new Error("publicPort requires publicService.");
    return services;
  }

  const serviceName = publicService.trim();
  const selected = services.find((service) => service.name === serviceName);
  if (!selected) {
    throw new Error(
      `Public service "${serviceName}" was not found. Available services: ${
        services.map((service) => service.name).join(", ") || "none"
      }.`,
    );
  }

  const requestedPort = publicPort === undefined ? undefined : Number(publicPort);
  if (
    requestedPort !== undefined &&
    (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535)
  ) {
    throw new Error(
      `Invalid public port "${publicPort}". Expected a container port from 1 to 65535.`,
    );
  }

  const port = requestedPort ?? resolveServicePort(selected);
  if (port === null || port === undefined) {
    throw new Error(
      `Public service "${serviceName}" has no declared container port. Pass publicPort explicitly.`,
    );
  }

  const domain = resolveServiceHostnameLabel(
    project.slug || project.name,
    selected.name,
    undefined,
    serviceKind(selected),
  );

  return services.map((service) =>
    service.name === serviceName
      ? {
          ...service,
          exposed: true,
          exposedPort: String(port),
          domain,
          customDomain: undefined,
          domainType: "free",
          publicEndpoints: [{ port, domain, domainType: "free" }],
        }
      : service,
  );
}
