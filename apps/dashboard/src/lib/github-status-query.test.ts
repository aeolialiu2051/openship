import { describe, expect, it, vi } from "vitest";
import { createGitHubStatusQuery } from "./github-status-query";

describe("createGitHubStatusQuery", () => {
  it("shows the cached status immediately while a fresh status revalidates", async () => {
    let resolveRefresh!: (value: string) => void;
    const loader = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("connected")
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveRefresh = resolve;
          }),
      );
    const query = createGitHubStatusQuery(loader);

    await expect(query.prefetch()).resolves.toBe("connected");
    query.invalidate({ revalidate: true });

    expect(query.getSnapshot()).toMatchObject({
      data: "connected",
      isFetching: true,
    });

    resolveRefresh("disconnected");
    await vi.waitFor(() => expect(query.getSnapshot().data).toBe("disconnected"));
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
