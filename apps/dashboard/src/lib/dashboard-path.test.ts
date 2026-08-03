import { describe, expect, it } from "vitest";

import {
  DASHBOARD_BASE_PATH,
  dashboardUrl,
  withDashboardBasePath,
  withoutDashboardBasePath,
} from "./dashboard-path";

describe("dashboard path helpers", () => {
  it("preserves self-hosted root paths when no base path is configured", () => {
    expect(DASHBOARD_BASE_PATH).toBe("");
    expect(withDashboardBasePath("/login")).toBe("/login");
    expect(withoutDashboardBasePath("/login")).toBe("/login");
    expect(dashboardUrl("https://ops.example.com", "/login")).toBe(
      "https://ops.example.com/login",
    );
  });

  it("does not alter absolute or protocol-relative destinations", () => {
    expect(withDashboardBasePath("https://example.com/path")).toBe("https://example.com/path");
    expect(withDashboardBasePath("//example.com/path")).toBe("//example.com/path");
  });
});
