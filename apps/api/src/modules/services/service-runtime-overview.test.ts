import { describe, expect, it } from "vitest";
import { shouldExposeProjectRuntime } from "./service-runtime-overview";

describe("shouldExposeProjectRuntime", () => {
  it("shows the project runtime for a deployed single-container app", () => {
    expect(
      shouldExposeProjectRuntime({
        containerId: "container-main",
        framework: "static",
        serviceKinds: [],
      }),
    ).toBe(true);
  });

  it("does not duplicate a Docker Compose app service", () => {
    expect(
      shouldExposeProjectRuntime({
        containerId: "compose-primary",
        framework: "docker-compose",
        serviceKinds: ["compose", "compose"],
      }),
    ).toBe(false);
  });

  it("does not duplicate monorepo sub-app services", () => {
    expect(
      shouldExposeProjectRuntime({
        containerId: "legacy-primary",
        framework: "nodejs",
        serviceKinds: ["monorepo"],
      }),
    ).toBe(false);
  });

  it("does not invent a runtime before deployment", () => {
    expect(
      shouldExposeProjectRuntime({
        containerId: null,
        framework: "nextjs",
        serviceKinds: [],
      }),
    ).toBe(false);
  });
});
