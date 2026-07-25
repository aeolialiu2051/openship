import { describe, expect, it } from "vitest";
import { displayedDeployTarget, resolveDeployTargetClick } from "./deploy-defaults-state";

describe("deployment default target selection", () => {
  it("opens the existing server picker before attempting to save a server target", () => {
    expect(resolveDeployTargetClick("server")).toEqual({
      kind: "open-server-picker",
    });
  });

  it("shows the server target as selected while choosing a server", () => {
    expect(displayedDeployTarget("cloud", true)).toBe("server");
  });

  it("marks OpenShip Cloud as coming soon instead of saving it", () => {
    expect(resolveDeployTargetClick("cloud")).toEqual({
      kind: "coming-soon",
    });
  });

  it("does not present a previously saved cloud target as active", () => {
    expect(displayedDeployTarget("cloud", false)).toBeNull();
  });

  it("saves available targets that do not require an additional choice immediately", () => {
    expect(resolveDeployTargetClick("local")).toEqual({
      kind: "save-target",
      target: "local",
      serverId: null,
    });
  });
});
