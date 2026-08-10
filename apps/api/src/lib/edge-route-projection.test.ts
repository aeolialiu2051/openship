import { describe, expect, it, vi } from "vitest";
import { waitForManagedRoutePropagation } from "./edge-route-readiness";

describe("waitForManagedRoutePropagation", () => {
  it("waits until the requested route version is visible at the edge", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response("Not found", { status: 404, headers: { "x-vibrail-route-status": "miss" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204, headers: { "x-vibrail-route-status": "hit", "x-vibrail-route-version": "4" } }));

    await expect(waitForManagedRoutePropagation("app.vibrail.app", 4, {
      fetch: request as typeof fetch,
      timeoutMs: 100,
      pollMs: 0,
    })).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not accept a stale route version", async () => {
    const request = vi.fn(async () => new Response(null, {
      status: 204,
      headers: { "x-vibrail-route-status": "hit", "x-vibrail-route-version": "3" },
    }));

    await expect(waitForManagedRoutePropagation("app.vibrail.app", 4, {
      fetch: request as typeof fetch,
      timeoutMs: 1,
      pollMs: 0,
    })).resolves.toBe(false);
  });
});
