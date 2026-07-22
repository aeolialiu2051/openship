import { describe, expect, it } from "vitest";
import { DASHBOARD_RUNTIME_TARGETS } from "@repo/core";

describe("runtime target capabilities", () => {
  it("allows user-owned VPS targets in local and local-saas only", () => {
    expect(DASHBOARD_RUNTIME_TARGETS.local.userServers).toBe(true);
    expect(DASHBOARD_RUNTIME_TARGETS["local-saas"].userServers).toBe(true);
    expect(DASHBOARD_RUNTIME_TARGETS["cloud-saas"].userServers).toBe(false);
  });
});
