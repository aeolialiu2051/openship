import { describe, expect, it } from "vitest";
import {
  CLOUD_API_URL,
  CLOUD_DASHBOARD_URL,
  resolveDashboardPageUrl,
} from "../src/runtime-config";

describe("resolveDashboardPageUrl", () => {
  it("uses the production app origin for dashboard, API, and login", () => {
    expect(CLOUD_DASHBOARD_URL).toBe("https://app.vibrail.com");
    expect(CLOUD_API_URL).toBe("https://app.vibrail.com/api/proxy");
    expect(resolveDashboardPageUrl(CLOUD_DASHBOARD_URL, "/authorize")).toBe(
      "https://app.vibrail.com/authorize",
    );
  });

  it("preserves a hosted dashboard mount path", () => {
    expect(
      resolveDashboardPageUrl("https://vibrail.example/dashboard", "/authorize?flow=cli-login"),
    ).toBe("https://vibrail.example/dashboard/authorize?flow=cli-login");
  });

  it("keeps root-mounted self-hosted dashboards working", () => {
    expect(resolveDashboardPageUrl("https://ops.example.com", "/settings")).toBe(
      "https://ops.example.com/settings",
    );
  });

  it("does not duplicate an already-prefixed dashboard path", () => {
    expect(resolveDashboardPageUrl("https://vibrail.example/dashboard/", "/dashboard/login")).toBe(
      "https://vibrail.example/dashboard/login",
    );
  });
});
