import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRepository, resolveAnonymousGitHubSource } = vi.hoisted(() => ({
  getRepository: vi.fn(),
  resolveAnonymousGitHubSource: vi.fn(),
}));

vi.mock("../../../src/modules/github/github.service", () => ({
  getRepository,
}));

vi.mock("../../../src/modules/deployments/anonymous-github-source", () => ({
  resolveAnonymousGitHubSource,
}));

import { resolveProjectInfo } from "../../../src/modules/deployments/prepare.service";

const ctx = { userId: "user-1", organizationId: "org-1" } as const;

describe("public GitHub repository preparation", () => {
  beforeEach(() => {
    getRepository.mockReset();
    resolveAnonymousGitHubSource.mockReset();
  });

  it("falls back to an anonymous shallow clone when tokenless REST reads are unavailable", async () => {
    const prepared = { repository: { full_name: "owner/public-repo" }, stack: "nextjs" };
    getRepository.mockRejectedValue(
      new Error("No GitHub access token available. Please connect your GitHub account."),
    );
    resolveAnonymousGitHubSource.mockResolvedValue(prepared);

    await expect(
      resolveProjectInfo({
        source: "github",
        owner: "owner",
        repo: "public-repo",
        branch: "release",
        ctx,
      }),
    ).resolves.toBe(prepared);
    expect(resolveAnonymousGitHubSource).toHaveBeenCalledWith(
      "owner",
      "public-repo",
      "release",
    );
  });

  it("preserves the connect-GitHub error when anonymous clone also fails", async () => {
    const authError = new Error(
      "No GitHub access token available. Please connect your GitHub account.",
    );
    getRepository.mockRejectedValue(authError);
    resolveAnonymousGitHubSource.mockRejectedValue(new Error("repository not found"));

    await expect(
      resolveProjectInfo({ source: "github", owner: "owner", repo: "private-repo", ctx }),
    ).rejects.toBe(authError);
  });

  it("does not hide unrelated GitHub failures behind clone fallback", async () => {
    const upstreamError = new Error("GitHub API error (500): unavailable");
    getRepository.mockRejectedValue(upstreamError);

    await expect(
      resolveProjectInfo({ source: "github", owner: "owner", repo: "repo", ctx }),
    ).rejects.toBe(upstreamError);
    expect(resolveAnonymousGitHubSource).not.toHaveBeenCalled();
  });
});
