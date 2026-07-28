import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  getByDomain: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateVerification: vi.fn(),
  remove: vi.fn(),
  verifyZone: vi.fn(),
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  decrypt: vi.fn((value: string) => value.replace(/^encrypted:/, "")),
}));

vi.mock("@repo/db", () => ({
  repos: {
    domainSettings: {
      list: mocks.list,
      getById: mocks.getById,
      getByDomain: mocks.getByDomain,
      create: mocks.create,
      update: mocks.update,
      updateVerification: mocks.updateVerification,
      remove: mocks.remove,
    },
  },
}));

vi.mock("../../../src/lib/encryption", () => ({
  encrypt: mocks.encrypt,
  decrypt: mocks.decrypt,
}));

vi.mock("../../../src/lib/cloudflare-dns", () => ({
  normalizeDnsZoneDomain: (value: string) => value.trim().toLowerCase(),
  verifyCloudflareZone: mocks.verifyZone,
}));

import {
  createDomainSettings,
  listDomainSettings,
  testDomainSettings,
  updateDomainSettings,
} from "../../../src/modules/domain-settings/domain-settings.service";

const ctx = { organizationId: "org-1", userId: "user-1" } as any;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyZone.mockResolvedValue({ domain: "example.com", zoneId: "zone-1" });
  mocks.create.mockImplementation(async (input) => ({
    ...input,
    id: "dns-1",
    createdAt: new Date("2026-07-28T00:00:00Z"),
    updatedAt: new Date("2026-07-28T00:00:00Z"),
  }));
  mocks.update.mockImplementation(async (_organizationId, id, input) => ({
    ...input,
    id,
    organizationId: "org-1",
    createdAt: new Date("2026-07-28T00:00:00Z"),
    updatedAt: new Date("2026-07-28T00:00:00Z"),
  }));
});

describe("organization domain settings", () => {
  it("encrypts a new token and never returns it", async () => {
    mocks.getByDomain.mockResolvedValue(undefined);
    const result = await createDomainSettings(ctx, {
      domain: "Example.COM",
      cloudflareZoneId: "zone-1",
      cloudflareApiToken: "secret-token",
      cloudflareProxy: true,
    });

    expect(mocks.verifyZone).toHaveBeenCalledWith({
      domain: "example.com",
      zoneId: "zone-1",
      apiToken: "secret-token",
    });
    expect(mocks.encrypt).toHaveBeenCalledWith("secret-token");
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        cloudflareApiTokenEncrypted: "encrypted:secret-token",
      }),
    );
    expect(result).toMatchObject({
      domain: "example.com",
      cloudflareApiTokenConfigured: true,
    });
    expect(result).not.toHaveProperty("cloudflareApiTokenEncrypted");
  });

  it("tests new credentials without saving domain settings", async () => {
    const result = await testDomainSettings(ctx, {
      domain: "Example.COM",
      cloudflareZoneId: "zone-1",
      cloudflareApiToken: "secret-token",
      cloudflareProxy: true,
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.verifyZone).toHaveBeenCalledWith({
      domain: "example.com",
      zoneId: "zone-1",
      apiToken: "secret-token",
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("preserves the saved token when an edit leaves the token blank", async () => {
    mocks.getById.mockResolvedValue({
      id: "dns-1",
      organizationId: "org-1",
      domain: "example.com",
      cloudflareZoneId: "zone-1",
      cloudflareApiTokenEncrypted: "encrypted:old-token",
      cloudflareProxy: true,
    });

    mocks.getByDomain.mockResolvedValue({ id: "dns-1" });

    await updateDomainSettings(ctx, "dns-1", {
      domain: "example.com",
      cloudflareZoneId: "zone-1",
      cloudflareProxy: false,
    });

    expect(mocks.decrypt).toHaveBeenCalledWith("encrypted:old-token");
    expect(mocks.verifyZone).toHaveBeenCalledWith(
      expect.objectContaining({ apiToken: "old-token" }),
    );
  });

  it("returns only a masked credential state", async () => {
    mocks.list.mockResolvedValue([
      {
        id: "dns-1",
        organizationId: "org-1",
        domain: "example.com",
        cloudflareZoneId: "zone-1",
        cloudflareApiTokenEncrypted: "encrypted:never-return-this",
        cloudflareProxy: true,
        verifiedAt: new Date("2026-07-28T00:00:00Z"),
        lastVerificationError: null,
        updatedAt: new Date("2026-07-28T00:00:00Z"),
      },
    ]);

    const result = await listDomainSettings(ctx);
    expect(result[0]).toMatchObject({
      domain: "example.com",
      cloudflareApiTokenConfigured: true,
    });
    expect(JSON.stringify(result)).not.toContain("never-return-this");
  });

  it("allows an organization to connect more than one domain", async () => {
    mocks.getByDomain.mockResolvedValue(undefined);

    await createDomainSettings(ctx, {
      domain: "example.com",
      cloudflareZoneId: "zone-1",
      cloudflareApiToken: "token-1",
    });
    await createDomainSettings(ctx, {
      domain: "example.org",
      cloudflareZoneId: "zone-2",
      cloudflareApiToken: "token-2",
    });

    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls.map(([input]) => input.domain)).toEqual([
      "example.com",
      "example.org",
    ]);
  });
});
