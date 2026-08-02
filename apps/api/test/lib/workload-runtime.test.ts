import { describe, expect, it } from "vitest";
import { resolveServerWorkloadRuntimeMode } from "../../src/lib/workload-runtime";

describe("resolveServerWorkloadRuntimeMode", () => {
  it("containerizes omitted and legacy bare user workload snapshots", () => {
    expect(resolveServerWorkloadRuntimeMode({})).toBe("docker");
    expect(resolveServerWorkloadRuntimeMode({ runtimeMode: "bare" })).toBe("docker");
  });

  it("does not preserve a generic legacy bare adopt snapshot", () => {
    expect(resolveServerWorkloadRuntimeMode({ runtimeMode: "bare", adopt: true })).toBe("docker");
  });

  it("preserves only the explicitly marked control plane bare adopt deployment", () => {
    expect(resolveServerWorkloadRuntimeMode({
      runtimeMode: "bare",
      adopt: true,
      controlPlaneAdopt: true,
    })).toBe("bare");
  });
});
