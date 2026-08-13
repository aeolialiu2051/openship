import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPrimaryByProject: vi.fn(),
  updateFaviconCache: vi.fn(),
  safeFetch: vi.fn(),
}));

vi.mock("@repo/db", () => ({
  repos: {
    domain: { getPrimaryByProject: mocks.getPrimaryByProject },
    project: { updateFaviconCache: mocks.updateFaviconCache },
  },
}));
vi.mock("../config/env", () => ({ env: { CLOUD_MODE: false } }));
vi.mock("./routing-domains", () => ({ getRoutingBaseDomain: () => "vibrail.app" }));
vi.mock("./safe-fetch", () => ({ safeFetch: mocks.safeFetch }));

import { detectAndStoreFavicon, refreshProjectFaviconIfStale } from "./favicon-detector";

describe("favicon detector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPrimaryByProject.mockResolvedValue(null);
    mocks.updateFaviconCache.mockResolvedValue(undefined);
  });

  it("uses the managed slug domain when a project has no custom domain", async () => {
    mocks.safeFetch.mockResolvedValue({
      ok: true,
      headers: { "content-type": "image/x-icon" },
    });

    refreshProjectFaviconIfStale({
      id: "project-1",
      slug: "daily-stock-analysis",
      activeDeploymentId: "deployment-1",
      faviconCheckedAt: null,
    });
    await vi.waitFor(() => expect(mocks.updateFaviconCache).toHaveBeenCalledOnce());

    expect(mocks.safeFetch).toHaveBeenCalledWith(
      "https://daily-stock-analysis.vibrail.app/favicon.ico",
      expect.objectContaining({ method: "HEAD" }),
    );
    expect(mocks.updateFaviconCache).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({ favicon: "https://daily-stock-analysis.vibrail.app/favicon.ico" }),
    );
  });

  it("clears a cached favicon when the current site no longer has one", async () => {
    mocks.safeFetch.mockResolvedValue({ ok: false, headers: {} });

    await detectAndStoreFavicon("project-2", "https://new-site.example");

    expect(mocks.updateFaviconCache).toHaveBeenCalledWith(
      "project-2",
      expect.objectContaining({ favicon: null }),
    );
  });
});
