import { describe, expect, it } from "vitest";
import { failedResourceServerIds, parseMemoryToMiB } from "./useResourceUsage";

describe("resource usage monitoring", () => {
  it("tracks the server whose metrics request failed", () => {
    const failed = failedResourceServerIds(
      ["server-ok", "server-timeout"],
      [
        { status: "fulfilled", value: {} },
        { status: "rejected", reason: new Error("HTTP 504") },
      ],
    );

    expect([...failed]).toEqual(["server-timeout"]);
  });

  it("does not report a failed server when all metrics requests succeed", () => {
    expect(
      failedResourceServerIds(
        ["server-a"],
        [{ status: "fulfilled", value: {} }],
      ).size,
    ).toBe(0);
  });

  it("continues to parse Docker memory values", () => {
    expect(parseMemoryToMiB("1.5GiB")).toBe(1536);
  });
});
