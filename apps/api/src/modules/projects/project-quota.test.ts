import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { CLOUD_MODE: true },
  findOrganization: vi.fn(),
  listProjectGroups: vi.fn(),
  getRuntimeConfig: vi.fn(),
  cloudRequest: vi.fn(),
}));

vi.mock("@repo/db", () => ({
  repos: {
    organization: { findById: mocks.findOrganization },
    projectGroup: { listByOrganization: mocks.listProjectGroups },
  },
}));

vi.mock("../../config", () => ({ env: mocks.env }));
vi.mock("../../lib/runtime-config", () => ({
  getRuntimeConfig: mocks.getRuntimeConfig,
}));
vi.mock("../../lib/cloud/client", () => ({
  cloudClient: () => ({ request: mocks.cloudRequest }),
}));

import { assertProjectQuota } from "./project-quota";

describe("project quota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.CLOUD_MODE = true;
    mocks.findOrganization.mockResolvedValue({ planTierId: "free" });
    mocks.getRuntimeConfig.mockResolvedValue({ CLOUD_MAX_PROJECTS_PER_USER: 5 });
    mocks.listProjectGroups.mockResolvedValue({ total: 0, items: [] });
    mocks.cloudRequest.mockResolvedValue(null);
  });

  it("enforces the configured limit for Cloud Free organizations", async () => {
    mocks.listProjectGroups.mockResolvedValue({ total: 5, items: [] });

    await expect(assertProjectQuota("org_free")).rejects.toThrow(
      "Project limit reached (5)",
    );
  });

  it("uses the same configured limit for self-hosted Free organizations", async () => {
    mocks.env.CLOUD_MODE = false;
    mocks.listProjectGroups.mockResolvedValue({ total: 5, items: [] });

    await expect(assertProjectQuota("org_local")).rejects.toThrow(
      "Project limit reached (5)",
    );
  });

  it("does not limit Cloud Pro organizations", async () => {
    mocks.findOrganization.mockResolvedValue({ planTierId: "pro" });

    await expect(assertProjectQuota("org_pro")).resolves.toBeUndefined();
    expect(mocks.listProjectGroups).not.toHaveBeenCalled();
  });

  it("uses the linked Cloud subscription for self-hosted Pro organizations", async () => {
    mocks.env.CLOUD_MODE = false;
    mocks.cloudRequest.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { tier: "pro" } }),
    });

    await expect(assertProjectQuota("org_linked_pro")).resolves.toBeUndefined();
    expect(mocks.cloudRequest).toHaveBeenCalledWith("/api/billing/state");
    expect(mocks.listProjectGroups).not.toHaveBeenCalled();
  });

  it("falls back to the Free limit when Cloud entitlement cannot be read", async () => {
    mocks.env.CLOUD_MODE = false;
    mocks.cloudRequest.mockRejectedValue(new Error("offline"));
    mocks.listProjectGroups.mockResolvedValue({ total: 4, items: [] });

    await expect(assertProjectQuota("org_offline")).resolves.toBeUndefined();
    expect(mocks.listProjectGroups).toHaveBeenCalledWith("org_offline", {
      page: 1,
      perPage: 1,
    });
  });
});
