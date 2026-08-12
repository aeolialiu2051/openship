import { describe, expect, it } from "vitest";
import { requiresRemoteCloneCredential } from "./preflight-git-credentials";

const remoteBare = {
  needsClone: true,
  repoIsPublic: false,
  runtimeIsBare: true,
  hasServer: true,
  effectiveTarget: "server",
  buildStrategy: "server" as const,
};

describe("requiresRemoteCloneCredential", () => {
  it("requires a credential for a private remote bare clone", () => {
    expect(requiresRemoteCloneCredential(remoteBare)).toBe(true);
  });

  it("does not credential-gate Docker Compose server builds", () => {
    expect(
      requiresRemoteCloneCredential({ ...remoteBare, runtimeIsBare: false }),
    ).toBe(false);
  });

  it("does not credential-gate public repositories", () => {
    expect(
      requiresRemoteCloneCredential({ ...remoteBare, repoIsPublic: true }),
    ).toBe(false);
  });

  it("does not credential-gate builds cloned on the API host", () => {
    expect(
      requiresRemoteCloneCredential({ ...remoteBare, buildStrategy: "local" }),
    ).toBe(false);
  });
});
