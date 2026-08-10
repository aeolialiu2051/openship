import { describe, expect, it, vi } from "vitest";
import { executeEdgeRouteCleanupPhases, type CleanupResource, type CleanupResult } from "./project-cleanup.service";

const resource = (type: "edge_route" | "edge_route_delete"): CleanupResource => ({
  type,
  ref: "app-k3m9x2ab.vibrail.app",
  label: type,
  runtime: null,
});

describe("managed edge deletion barrier", () => {
  it("disables, waits a full propagation window, then removes KV", async () => {
    const order: string[] = [];
    const result: CleanupResult = { total: 2, succeeded: 0, failed: [] };
    await executeEdgeRouteCleanupPhases({
      disableResources: [resource("edge_route")],
      deleteResources: [resource("edge_route_delete")],
      result,
      propagationDelayMs: 31_000,
      destroy: vi.fn(async (item) => { order.push(item.type); }),
      delay: vi.fn(async (milliseconds) => { order.push(`wait:${milliseconds}`); }),
    });
    expect(order).toEqual(["edge_route", "wait:31000", "edge_route_delete"]);
    expect(result).toMatchObject({ succeeded: 2, failed: [] });
  });

  it("does not wait, delete KV, or touch runtime after disable fails", async () => {
    const delay = vi.fn(async () => undefined);
    const destroy = vi.fn(async (item: CleanupResource) => {
      if (item.type === "edge_route") throw new Error("KV unavailable");
    });
    const result: CleanupResult = { total: 2, succeeded: 0, failed: [] };
    await executeEdgeRouteCleanupPhases({ disableResources: [resource("edge_route")], deleteResources: [resource("edge_route_delete")], result, propagationDelayMs: 31_000, destroy, delay });
    expect(delay).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(result.failed[0]?.error).toContain("KV unavailable");
  });
});
