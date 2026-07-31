import { describe, expect, it } from "vitest";
import { resolveSavedProjectType } from "./saved-project-shape";

describe("resolveSavedProjectType", () => {
  it("keeps Compose authoritative before an MCP import has service rows", () => {
    expect(
      resolveSavedProjectType({
        framework: "docker-compose",
        projectType: "app",
        hasMonorepoRows: false,
        hasComposeRows: false,
      }),
    ).toBe("services");
  });

  it("prefers persisted service-row shapes", () => {
    expect(
      resolveSavedProjectType({
        framework: "nextjs",
        projectType: "app",
        hasMonorepoRows: false,
        hasComposeRows: true,
      }),
    ).toBe("services");
    expect(
      resolveSavedProjectType({
        framework: "docker-compose",
        projectType: "services",
        hasMonorepoRows: true,
        hasComposeRows: true,
      }),
    ).toBe("monorepo");
  });

  it("preserves ordinary single-app project types", () => {
    expect(
      resolveSavedProjectType({
        framework: "fastapi",
        projectType: "app",
        hasMonorepoRows: false,
        hasComposeRows: false,
      }),
    ).toBe("app");
  });
});
