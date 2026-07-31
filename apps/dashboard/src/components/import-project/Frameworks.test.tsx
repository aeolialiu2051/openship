import { describe, expect, it } from "vitest";
import { folderImportFrameworks, frameworks } from "./Frameworks";

describe("framework source lists", () => {
  it("puts Docker Compose first and omits a manual Dockerfile choice", () => {
    expect(folderImportFrameworks[0]?.id).toBe("docker-compose");
    expect(folderImportFrameworks.some((framework) => framework.id === "docker")).toBe(false);
  });

  it("keeps container packaging choices out of application templates", () => {
    expect(frameworks.some((framework) => framework.id === "docker")).toBe(false);
    expect(frameworks.some((framework) => framework.id === "docker-compose")).toBe(false);
  });
});
