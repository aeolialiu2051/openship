import { describe, expect, it } from "vitest";
import { resolveEffectiveTarget } from "../../src/lib/deployment-runtime";

describe("resolveEffectiveTarget", () => {
  it("routes an explicit user-server deployment from a cloud control plane to SSH", () => {
    expect(
      resolveEffectiveTarget(
        "cloud",
        {
          deployTarget: "server",
          serverId: "srv_user_vps",
        },
        true,
      ),
    ).toBe("server");
  });

  it("does not expose SSH targets from production cloud SaaS", () => {
    expect(
      resolveEffectiveTarget(
        "cloud",
        {
          deployTarget: "server",
          serverId: "srv_user_vps",
        },
        false,
      ),
    ).toBe("cloud");
  });

  it("keeps managed deployments on the cloud runtime", () => {
    expect(resolveEffectiveTarget("cloud", { deployTarget: "cloud" })).toBe("cloud");
  });
});
