import { describe, expect, it } from "vitest";
import { CLOUD_API_URL, CLOUD_DASHBOARD_URL, DASHBOARD_RUNTIME_TARGETS } from "@repo/core";

describe("runtime target capabilities", () => {
  it("allows user-owned VPS targets in local and vibrail-saas", () => {
    expect(DASHBOARD_RUNTIME_TARGETS.local.userServers).toBe(true);
    expect(DASHBOARD_RUNTIME_TARGETS["vibrail-saas"].userServers).toBe(true);
  });

  it("uses Vibrail's public endpoints for vibrail-saas", () => {
    expect(DASHBOARD_RUNTIME_TARGETS["vibrail-saas"].dashboard).toBe(CLOUD_DASHBOARD_URL);
    expect(DASHBOARD_RUNTIME_TARGETS["vibrail-saas"].api).toBe(CLOUD_API_URL);
  });
});
