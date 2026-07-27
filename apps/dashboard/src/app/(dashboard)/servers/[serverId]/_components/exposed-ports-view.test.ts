import { describe, expect, it } from "vitest";
import { formatPortDetailsLabel, safeArray } from "./exposed-ports-view";

describe("exposed ports view compatibility", () => {
  it("falls back when an older SSR dictionary lacks portDetails", () => {
    expect(formatPortDetailsLabel({ title: "Port exposure" }, 12)).toBe("Port exposure (12)");
  });

  it("uses the translated portDetails template when available", () => {
    expect(formatPortDetailsLabel({ portDetails: "端口详情（{count}）" }, 8)).toBe("端口详情（8）");
  });

  it("normalizes a missing listener collection", () => {
    expect(safeArray(undefined)).toEqual([]);
  });
});
