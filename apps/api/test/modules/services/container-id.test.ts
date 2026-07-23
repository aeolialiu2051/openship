import { describe, expect, it } from "vitest";
import { findContainerByTrackedId } from "../../../src/modules/services/container-id";

const fullId = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("findContainerByTrackedId", () => {
  it("prefers an exact container ID match", () => {
    const exact = { containerId: fullId, status: "running" };
    const containers = [{ containerId: fullId.slice(0, 12), status: "stopped" }, exact];

    expect(findContainerByTrackedId(containers, fullId)).toBe(exact);
  });

  it("matches a unique 12-character Docker ID prefix", () => {
    const abbreviated = { containerId: fullId.slice(0, 12), status: "running" };

    expect(findContainerByTrackedId([abbreviated], fullId)).toBe(abbreviated);
  });

  it("also tolerates a legacy abbreviated ID stored in the deployment row", () => {
    const observed = { containerId: fullId, status: "running" };

    expect(findContainerByTrackedId([observed], fullId.slice(0, 12))).toBe(observed);
  });

  it("does not guess when a prefix matches more than one container", () => {
    const prefix = "0123456789ab";
    const containers = [
      { containerId: `${prefix}${"c".repeat(52)}`, status: "running" },
      { containerId: `${prefix}${"d".repeat(52)}`, status: "running" },
    ];

    expect(findContainerByTrackedId(containers, prefix)).toBeUndefined();
  });

  it("rejects prefixes shorter than Docker's standard 12-character ID", () => {
    expect(
      findContainerByTrackedId([{ containerId: fullId, status: "running" }], "012345"),
    ).toBeUndefined();
  });
});
