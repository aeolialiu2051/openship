import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listMemberships: vi.fn(),
  findOrganizations: vi.fn(),
}));

vi.mock("@repo/db", () => ({
  repos: {
    member: { listByUser: mocks.listMemberships },
    organization: { findManyById: mocks.findOrganizations },
  },
}));

import { hasReachedOrganizationLimit } from "./organization-quota";

function memberships(count: number, role = "owner") {
  return Array.from({ length: count }, (_, index) => ({
    organizationId: `org_${index + 1}`,
    role,
  }));
}

describe("organization quota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listMemberships.mockResolvedValue([]);
    mocks.findOrganizations.mockResolvedValue([]);
  });

  it("allows a Free user to create their first workspace", async () => {
    await expect(hasReachedOrganizationLimit("user_free")).resolves.toBe(false);
  });

  it("blocks a Free user after one workspace", async () => {
    mocks.listMemberships.mockResolvedValue(memberships(1));
    mocks.findOrganizations.mockResolvedValue([
      { id: "org_1", planTierId: "free" },
    ]);

    await expect(hasReachedOrganizationLimit("user_free")).resolves.toBe(true);
  });

  it("allows a Pro user with nine workspaces", async () => {
    mocks.listMemberships.mockResolvedValue(memberships(9));
    mocks.findOrganizations.mockResolvedValue([
      { id: "org_1", planTierId: "pro" },
    ]);

    await expect(hasReachedOrganizationLimit("user_pro")).resolves.toBe(false);
  });

  it("blocks a Pro user at ten workspaces", async () => {
    mocks.listMemberships.mockResolvedValue(memberships(10));
    mocks.findOrganizations.mockResolvedValue([
      { id: "org_1", planTierId: "pro" },
    ]);

    await expect(hasReachedOrganizationLimit("user_pro")).resolves.toBe(true);
  });

  it("does not grant paid quota from a workspace the user does not own", async () => {
    mocks.listMemberships.mockResolvedValue([
      { organizationId: "org_owned", role: "owner" },
      { organizationId: "org_invited_pro", role: "member" },
    ]);
    mocks.findOrganizations.mockResolvedValue([
      { id: "org_owned", planTierId: "free" },
    ]);

    await expect(hasReachedOrganizationLimit("user_invited")).resolves.toBe(true);
    expect(mocks.findOrganizations).toHaveBeenCalledWith(["org_owned"]);
  });

  it.each(["team", "enterprise"])(
    "treats %s as a paid workspace tier",
    async (planTierId) => {
      mocks.listMemberships.mockResolvedValue(memberships(2));
      mocks.findOrganizations.mockResolvedValue([{ id: "org_1", planTierId }]);

      await expect(hasReachedOrganizationLimit(`user_${planTierId}`)).resolves.toBe(
        false,
      );
    },
  );
});
