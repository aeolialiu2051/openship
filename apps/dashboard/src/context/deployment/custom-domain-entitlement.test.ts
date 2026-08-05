import { describe, expect, it } from "vitest";
import type { CustomDomainProjectQuota } from "@/lib/api";
import { createPublicEndpoint, DEFAULT_CONFIG, type DeploymentConfig } from "./types";
import {
  deploymentUsesCustomDomain,
  findCustomDomainProjectConflict,
} from "./custom-domain-entitlement";

function config(overrides: Partial<DeploymentConfig> = {}): DeploymentConfig {
  return {
    ...DEFAULT_CONFIG,
    projectId: "project-current",
    publicEndpoints: [
      createPublicEndpoint({
        domainType: "custom",
        customDomain: "api.example.com",
      }),
    ],
    ...overrides,
  };
}

function quota(projectId: string): CustomDomainProjectQuota {
  return {
    tier: "free",
    limit: 1,
    used: 1,
    remaining: 0,
    claimedProjects: [{ projectId, projectName: "Existing project" }],
  };
}

describe("custom-domain deploy entitlement", () => {
  it("recognizes a selected custom hostname", () => {
    expect(deploymentUsesCustomDomain(config())).toBe(true);
  });

  it("blocks immediately when another project owns the Free-plan slot", () => {
    expect(findCustomDomainProjectConflict(config(), quota("project-other"))).toEqual({
      projectId: "project-other",
      projectName: "Existing project",
    });
  });

  it("allows redeploying the project that already owns the slot", () => {
    expect(findCustomDomainProjectConflict(config(), quota("project-current"))).toBeNull();
  });

  it("does not block when custom routing is disabled", () => {
    expect(findCustomDomainProjectConflict(config({ noPublicRoute: true }), quota("project-other"))).toBeNull();
  });
});
