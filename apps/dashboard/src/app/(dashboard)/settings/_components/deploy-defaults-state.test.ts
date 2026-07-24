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

  it("saves targets that do not require an additional choice immediately", () => {
    expect(resolveDeployTargetClick("cloud")).toEqual({
      kind: "save-target",
      target: "cloud",
      serverId: null,
    });
  });
});
