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
    expect(initial.values.BILLING_ENABLED).toBe(initial.environmentDefaults.BILLING_ENABLED);

    const updated = await updateRuntimeConfig({
      BILLING_ENABLED: !initial.environmentDefaults.BILLING_ENABLED,
    });
    expect(updated.values.BILLING_ENABLED).toBe(!initial.environmentDefaults.BILLING_ENABLED);
    expect(updated.overrides.BILLING_ENABLED).toBe(!initial.environmentDefaults.BILLING_ENABLED);
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
});
