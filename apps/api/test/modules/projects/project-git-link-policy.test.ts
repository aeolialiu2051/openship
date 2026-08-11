import { describe, expect, it } from "vitest";
import {
  resolveAppGitLinkPolicy,
  shouldEnableInitialAppAutoDeploy,
} from "../../../src/modules/projects/project-git-link-policy";

describe("resolveAppGitLinkPolicy", () => {
  it("enables App auto-deploy when the repository owner has an installation", () => {
    expect(resolveAppGitLinkPolicy(123)).toEqual({
      autoDeploy: true,
      installationId: 123,
      strategy: "app",
    });
  });

  it("links a public repository manually when its owner has no installation", () => {
    expect(resolveAppGitLinkPolicy(null)).toEqual({
      autoDeploy: false,
      installationId: null,
      strategy: "none",
    });
  });

  it("links a readable private repository manually when App auto-deploy is unavailable", () => {
    expect(resolveAppGitLinkPolicy(null)).toEqual({
      autoDeploy: false,
      installationId: null,
      strategy: "none",
    });
  });

  it("does not enable initial auto-deploy from repository identity alone", () => {
    expect(
      shouldEnableInitialAppAutoDeploy({
        cloudMode: true,
        gitOwner: "open-webui",
        gitRepo: "open-webui",
      }),
    ).toBe(false);
  });

  it("enables initial auto-deploy only with a resolved installation", () => {
    expect(
      shouldEnableInitialAppAutoDeploy({
        cloudMode: true,
        gitOwner: "acme",
        gitRepo: "private-app",
        installationId: 123,
      }),
    ).toBe(true);
  });
});
