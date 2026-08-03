import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DASHBOARD_BASE_PATH,
  dashboardUrl,
  withDashboardBasePath,
  withoutDashboardBasePath,
} from "./dashboard-path";

describe("dashboard path helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

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

  it("keeps browser history paths mounted under the configured dashboard base path", async () => {
    vi.stubEnv("NEXT_PUBLIC_DASHBOARD_BASE_PATH", "/dashboard/");
    vi.resetModules();

    const mountedPaths = await import("./dashboard-path");

    expect(mountedPaths.DASHBOARD_BASE_PATH).toBe("/dashboard");
    expect(mountedPaths.withDashboardBasePath("/projects/project-1/services")).toBe(
      "/dashboard/projects/project-1/services",
    );
    expect(mountedPaths.withDashboardBasePath("/dashboard/projects/project-1/services")).toBe(
      "/dashboard/projects/project-1/services",
    );
  });
});
