import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  domainClaims: vi.fn(),
  serviceRoutes: vi.fn(),
  resolveTier: vi.fn(),
}));

vi.mock("@repo/db", () => ({
  repos: {
    domain: { listCustomDomainProjectsByOrganization: mocks.domainClaims },
    service: { listRoutingByOrganization: mocks.serviceRoutes },
  },
  withAdvisoryLock: (_key: string, fn: () => Promise<unknown>) => fn(),
}));

vi.mock("../../lib/plan-tier", () => ({
  resolveOrganizationPlanTier: mocks.resolveTier,
  UNLIMITED_CUSTOM_DOMAIN_PROJECT_TIERS: new Set(["pro", "team", "enterprise"]),
}));

vi.mock("../../lib/provision-lock", () => ({
  withKeyedMutex: (_key: string, fn: () => Promise<unknown>) => fn(),
}));

import {
  CUSTOM_DOMAIN_PROJECT_LIMIT_CODE,
  assertCustomDomainProjectAllowed,
  getCustomDomainProjectQuota,
  hasCustomDomainConfiguration,
  withCustomDomainDumpEntitlement,
} from "./custom-domain-project-quota";

describe("custom-domain project quota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveTier.mockResolvedValue("free");
    mocks.domainClaims.mockResolvedValue([]);
    mocks.serviceRoutes.mockResolvedValue([]);
  });

  it("allows any number of custom hostnames on the same Free project", async () => {
    mocks.domainClaims.mockResolvedValue([{ projectId: "prj_a", projectName: "Project A" }]);

    await expect(assertCustomDomainProjectAllowed("org_1", "prj_a")).resolves.toBeUndefined();
  });

  it("blocks a second Free project", async () => {
    mocks.domainClaims.mockResolvedValue([{ projectId: "prj_a", projectName: "Project A" }]);

    await expect(assertCustomDomainProjectAllowed("org_1", "prj_b")).rejects.toMatchObject({
      statusCode: 403,
      code: CUSTOM_DOMAIN_PROJECT_LIMIT_CODE,
      details: { claimedProjectId: "prj_a" },
    });
  });

  it("counts un-deployed service configuration as a project claim", async () => {
    mocks.serviceRoutes.mockResolvedValue([
      {
        projectId: "prj_service",
        projectName: "Service Project",
        domainType: "free",
        customDomain: null,
        publicEndpoints: [{ port: 3000, domainType: "custom", customDomain: "api.example.com" }],
      },
    ]);

    const quota = await getCustomDomainProjectQuota("org_1");
    expect(quota).toMatchObject({
      limit: 1,
      used: 1,
      remaining: 0,
      claimedProjects: [{ projectId: "prj_service" }],
    });
  });

  it("allows paid organizations regardless of existing projects", async () => {
    mocks.resolveTier.mockResolvedValue("pro");
    mocks.domainClaims.mockResolvedValue([
      { projectId: "prj_a", projectName: "Project A" },
      { projectId: "prj_b", projectName: "Project B" },
    ]);

    await expect(assertCustomDomainProjectAllowed("org_1", "prj_c")).resolves.toBeUndefined();
  });

  it("detects scalar and multi-route custom domain configuration", () => {
    expect(
      hasCustomDomainConfiguration({
        domainType: "custom",
        customDomain: "app.example.com",
      }),
    ).toBe(true);
    expect(
      hasCustomDomainConfiguration({
        domainType: "free",
        publicEndpoints: [{ domainType: "custom", customDomain: "api.example.com" }],
      }),
    ).toBe(true);
    expect(hasCustomDomainConfiguration({ domainType: "free", customDomain: null })).toBe(false);
  });

  it("blocks a Free restore that would introduce a second custom-domain project", async () => {
    mocks.domainClaims.mockResolvedValue([
      { projectId: "prj_existing", projectName: "Existing Project" },
    ]);
    const restore = vi.fn();
    const dump = {
      formatVersion: 1,
      exportedAt: new Date(0).toISOString(),
      sourceDriver: "pg" as const,
      scope: { kind: "project" as const, projectId: "prj_import" },
      tables: {
        project: [{ id: "prj_import", name: "Imported Project" }],
        domain: [
          {
            id: "dom_import",
            projectId: "prj_import",
            ownerType: "project",
            domainType: "custom",
          },
        ],
      },
    };

    await expect(withCustomDomainDumpEntitlement("org_1", dump, restore)).rejects.toMatchObject({
      code: CUSTOM_DOMAIN_PROJECT_LIMIT_CODE,
    });
    expect(restore).not.toHaveBeenCalled();
  });
});
