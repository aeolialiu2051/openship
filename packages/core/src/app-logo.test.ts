import { describe, expect, it } from "vitest";
import { appLogoUrl, resolveAppLogo } from "./app-logo";

describe("app logo resolution", () => {
  it("uses Dashboard source overrides before the catalog logo", () => {
    expect(resolveAppLogo("cli-proxy-api", "cli-proxy-api").src).toContain("githubusercontent.com");
    expect(resolveAppLogo("uptime-kuma", "uptime-kuma").slug).toBe("uptimekuma");
    expect(appLogoUrl(resolveAppLogo("buzz", "buzz"))).toBe(
      "https://avatars.githubusercontent.com/u/185116535?s=60&v=4",
    );
  });

  it("uses an arbitrary catalog logo without app-specific code", () => {
    expect(appLogoUrl(resolveAppLogo("future-app", "futurebrand"))).toBe(
      "https://cdn.simpleicons.org/futurebrand",
    );
    expect(appLogoUrl(resolveAppLogo("future-app", "https://cdn.example/logo.svg"))).toBe(
      "https://cdn.example/logo.svg",
    );
  });
});
