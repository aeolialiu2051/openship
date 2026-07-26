import { beforeEach, describe, expect, it, vi } from "vitest";

const { getHome } = vi.hoisted(() => ({
  getHome: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  projectsApi: { getHome },
}));

describe("projects home cache invalidation", () => {
  beforeEach(() => {
    getHome.mockReset();
    vi.resetModules();
  });

  it("revalidates immediately after a project mutation", async () => {
    getHome.mockResolvedValue({ success: true, projects: [], numbers: {}, otherOrgs: [] });
    const { invalidateProjectsHomeCache } = await import("./useProjectsHome");

    invalidateProjectsHomeCache();

    await vi.waitFor(() => expect(getHome).toHaveBeenCalledTimes(1));
  });

  it("refetches after a pre-mutation request finishes", async () => {
    let resolveFirst!: (value: unknown) => void;
    getHome
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce({ success: true, projects: [], numbers: {}, otherOrgs: [] });
    const { invalidateProjectsHomeCache } = await import("./useProjectsHome");

    invalidateProjectsHomeCache();
    await vi.waitFor(() => expect(getHome).toHaveBeenCalledTimes(1));

    invalidateProjectsHomeCache();
    resolveFirst({ success: true, projects: [], numbers: {}, otherOrgs: [] });

    await vi.waitFor(() => expect(getHome).toHaveBeenCalledTimes(2));
  });
});
