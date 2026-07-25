import { describe, expect, it } from "vitest";
import { isDeploySelectionComingSoon } from "./deploy-target-availability";

describe("isDeploySelectionComingSoon", () => {
  it("marks Openship Cloud deployments as coming soon", () => {
    expect(
      isDeploySelectionComingSoon({
        deployTarget: "cloud",
        cloneStrategy: "server",
        isDesktop: false,
        showCloneStrategy: false,
      }),
    ).toBe(true);
  });

  it("marks cloning on the Openship host as coming soon", () => {
    expect(
      isDeploySelectionComingSoon({
        deployTarget: "server",
        cloneStrategy: "api-host",
        isDesktop: false,
        showCloneStrategy: true,
      }),
    ).toBe(true);
  });

  it("keeps cloning on the user's desktop available", () => {
    expect(
      isDeploySelectionComingSoon({
        deployTarget: "server",
        cloneStrategy: "api-host",
        isDesktop: true,
        showCloneStrategy: true,
      }),
    ).toBe(false);
  });

  it("ignores a stale api-host value when the clone picker does not apply", () => {
    expect(
      isDeploySelectionComingSoon({
        deployTarget: "server",
        cloneStrategy: "api-host",
        isDesktop: false,
        showCloneStrategy: false,
      }),
    ).toBe(false);
  });
});
