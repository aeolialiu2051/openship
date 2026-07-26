import { describe, expect, it, vi } from "vitest";
import { createClientQuery } from "./client-query-cache";

describe("createClientQuery", () => {
  it("deduplicates concurrent prefetches and reuses fresh data", async () => {
    let resolve!: (value: number) => void;
    const loader = vi.fn(() => new Promise<number>((done) => { resolve = done; }));
    const query = createClientQuery(loader, { ttlMs: 30_000 });

    const first = query.prefetch();
    const second = query.prefetch();
    expect(loader).toHaveBeenCalledTimes(1);

    resolve(42);
    await expect(first).resolves.toBe(42);
    await expect(second).resolves.toBe(42);
    await expect(query.prefetch()).resolves.toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("keeps stale data visible while an invalidation revalidates", async () => {
    const loader = vi.fn().mockResolvedValueOnce("old").mockResolvedValueOnce("new");
    const query = createClientQuery(loader);
    await query.prefetch();

    query.invalidate({ revalidate: true });
    expect(query.getSnapshot().data).toBe("old");
    await vi.waitFor(() => expect(query.getSnapshot().data).toBe("new"));
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
