import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ runtimeConfig: {} as Record<string, unknown> }));

vi.mock("@repo/db", () => ({
  repos: {
    instanceSettings: {
      get: async () => ({ runtimeConfig: store.runtimeConfig }),
      upsert: async ({ runtimeConfig }: { runtimeConfig: Record<string, unknown> }) => {
        store.runtimeConfig = runtimeConfig;
      },
    },
  },
}));

import { getRuntimeConfigState, updateRuntimeConfig } from "./runtime-config";

describe("runtime configuration", () => {
  beforeEach(() => {
    store.runtimeConfig = {};
  });

  it("inherits environment defaults until an admin override is saved", async () => {
    const initial = await getRuntimeConfigState();
    expect(initial.overrides).toEqual({});
    expect(initial.values.STRIPE_PRICE_PRO_MONTHLY).toBe(
      initial.environmentDefaults.STRIPE_PRICE_PRO_MONTHLY,
    );

    const updated = await updateRuntimeConfig({
      STRIPE_PRICE_PRO_MONTHLY: initial.environmentDefaults.STRIPE_PRICE_PRO_MONTHLY + 1,
    });
    expect(updated.values.STRIPE_PRICE_PRO_MONTHLY).toBe(
      initial.environmentDefaults.STRIPE_PRICE_PRO_MONTHLY + 1,
    );
    expect(updated.overrides.STRIPE_PRICE_PRO_MONTHLY).toBe(
      initial.environmentDefaults.STRIPE_PRICE_PRO_MONTHLY + 1,
    );
  });

  it("removes an override when the admin restores environment inheritance", async () => {
    store.runtimeConfig = { CLOUD_SESSION_PINNING: "strict" };
    const updated = await updateRuntimeConfig({ CLOUD_SESSION_PINNING: null });
    expect(updated.overrides.CLOUD_SESSION_PINNING).toBeUndefined();
    expect(updated.values.CLOUD_SESSION_PINNING).toBe(
      updated.environmentDefaults.CLOUD_SESSION_PINNING,
    );
  });

  it("rejects keys outside the runtime allowlist", async () => {
    await expect(
      updateRuntimeConfig({ DATABASE_URL: "nope" } as never),
    ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_RUNTIME_CONFIG" });
  });

  it("keeps billing feature flags environment-only", async () => {
    await expect(
      updateRuntimeConfig({ BILLING_ENABLED: true } as never),
    ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_RUNTIME_CONFIG" });
  });

  it("masks saved Stripe secrets and keeps them when a masked value is resubmitted", async () => {
    const saved = await updateRuntimeConfig({ STRIPE_SECRET_KEY: "sk_test_secret" });
    expect(saved.values.STRIPE_SECRET_KEY).toBe("••••••••");
    expect(String(store.runtimeConfig.STRIPE_SECRET_KEY)).not.toContain("sk_test_secret");

    await updateRuntimeConfig({ STRIPE_SECRET_KEY: "••••••••" });
    expect(String(store.runtimeConfig.STRIPE_SECRET_KEY)).not.toContain("sk_test_secret");
  });
});
