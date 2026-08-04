import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    CLOUD_MODE: false,
    DEPLOY_MODE: "docker",
    VIBRAIL_REQUIRE_AUTH: false,
    VIBRAIL_PUBLIC_URL: undefined as string | undefined,
  },
  getSettings: vi.fn(),
}));

vi.mock("../config/env", () => ({ env: mocks.env }));
vi.mock("@repo/db", () => ({
  repos: { instanceSettings: { get: mocks.getSettings } },
}));

import { clearAuthModeCache, getAuthMode } from "./auth-mode";

describe("getAuthMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthModeCache();
    mocks.env.CLOUD_MODE = false;
    mocks.env.DEPLOY_MODE = "docker";
    mocks.getSettings.mockResolvedValue({ authMode: "none" });
  });

  it("preserves an explicitly configured self-hosted zero-auth mode", async () => {
    await expect(getAuthMode()).resolves.toBe("none");
  });

  it("forces Better Auth on SaaS even when settings contain none", async () => {
    mocks.env.CLOUD_MODE = true;

    await expect(getAuthMode()).resolves.toBe("local");
    expect(mocks.getSettings).not.toHaveBeenCalled();
  });
});
