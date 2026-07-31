import { describe, expect, it } from "vitest";
import { assertProjectMayDeploy } from "./build.service";

describe("project deployment moderation", () => {
  it("allows active projects", () => {
    expect(() =>
      assertProjectMayDeploy({ id: "proj_active", moderationStatus: "active" }),
    ).not.toThrow();
  });

  it("blocks suspended projects", () => {
    expect(() =>
      assertProjectMayDeploy({ id: "proj_suspended", moderationStatus: "suspended" }),
    ).toThrow(/taken offline/i);
  });
});
