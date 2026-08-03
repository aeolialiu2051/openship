import { describe, expect, it } from "vitest";
import { resolveDashboardPageUrl } from "../src/runtime-config";

describe("resolveDashboardPageUrl", () => {
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
