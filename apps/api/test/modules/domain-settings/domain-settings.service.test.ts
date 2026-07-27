import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  upsert: vi.fn(),
  updateVerification: vi.fn(),
  remove: vi.fn(),
  verifyZone: vi.fn(),
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  decrypt: vi.fn((value: string) => value.replace(/^encrypted:/, "")),
}));

vi.mock("@repo/db", () => ({
  repos: {
    domainSettings: {
      get: mocks.get,
      upsert: mocks.upsert,
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
  getDomainSettings,
  saveDomainSettings,
} from "../../../src/modules/domain-settings/domain-settings.service";

const ctx = { organizationId: "org-1", userId: "user-1" } as any;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyZone.mockResolvedValue({ domain: "example.com", zoneId: "zone-1" });
  mocks.upsert.mockImplementation(async (input) => ({
    ...input,
    createdAt: new Date("2026-07-28T00:00:00Z"),
    updatedAt: new Date("2026-07-28T00:00:00Z"),
  }));
});

describe("organization domain settings", () => {
  it("encrypts a new token and never returns it", async () => {
    mocks.get.mockResolvedValue(undefined);
    const result = await saveDomainSettings(ctx, {
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
    expect(mocks.upsert).toHaveBeenCalledWith(
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

  it("preserves the saved token when an edit leaves the token blank", async () => {
    mocks.get.mockResolvedValue({
      organizationId: "org-1",
      domain: "example.com",
      cloudflareZoneId: "zone-1",
      cloudflareApiTokenEncrypted: "encrypted:old-token",
      cloudflareProxy: true,
    });

    await saveDomainSettings(ctx, {
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
    mocks.get.mockResolvedValue({
      organizationId: "org-1",
      domain: "example.com",
      cloudflareZoneId: "zone-1",
      cloudflareApiTokenEncrypted: "encrypted:never-return-this",
      cloudflareProxy: true,
      verifiedAt: new Date("2026-07-28T00:00:00Z"),
      lastVerificationError: null,
      updatedAt: new Date("2026-07-28T00:00:00Z"),
    });

    const result = await getDomainSettings(ctx);
    expect(result).toMatchObject({
      domain: "example.com",
      cloudflareApiTokenConfigured: true,
    });
    expect(JSON.stringify(result)).not.toContain("never-return-this");
  });
});
