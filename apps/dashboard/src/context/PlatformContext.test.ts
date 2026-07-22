import { describe, expect, it } from "vitest";
import { canChooseDeployTarget } from "./PlatformContext";

describe("canChooseDeployTarget", () => {
  it("exposes the target picker to local SaaS with user-owned servers", () => {
    expect(
      canChooseDeployTarget({ deployMode: "cloud", userServers: true }),
    ).toBe(true);
  });

  it("keeps the target picker hidden on production cloud SaaS", () => {
    expect(
      canChooseDeployTarget({ deployMode: "cloud", userServers: false }),
    ).toBe(false);
  });
});
