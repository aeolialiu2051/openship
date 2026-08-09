import { describe, expect, it } from "vitest";
import { isStaticProjectRuntime } from "./project-runtime";

describe("isStaticProjectRuntime", () => {
  it("treats hasServer as authoritative over stale productionMode", () => {
    expect(isStaticProjectRuntime({ hasServer: true, productionMode: "static" })).toBe(false);
    expect(isStaticProjectRuntime({ hasServer: false, productionMode: "host" })).toBe(true);
  });

  it("falls back to productionMode for legacy projects", () => {
    expect(isStaticProjectRuntime({ productionMode: "static" })).toBe(true);
    expect(isStaticProjectRuntime({ productionMode: "host" })).toBe(false);
  });
});
