import { describe, expect, it } from "vitest";
import { isUploadIgnoredPath, LANGUAGES, STACKS } from "@repo/core";
import { STARTER_TEMPLATES } from "@repo/core/starter-templates";
import { hasStarterTemplate } from "./starterTemplates";

describe("built-in starter templates", () => {
  it("only exposes valid stack ids with a compatible package manager", () => {
    for (const [stackId, starter] of Object.entries(STARTER_TEMPLATES)) {
      const stack = STACKS[stackId as keyof typeof STACKS];
      expect(stack, stackId).toBeDefined();
      const supportedPackageManagers = LANGUAGES[stack.language].packageManagers;
      if (supportedPackageManagers.length > 0) {
        expect(supportedPackageManagers, stackId).toContain(starter.packageManager);
      }
      expect(hasStarterTemplate(stackId)).toBe(true);
    }
  });

  it("contains safe, non-empty deployable source files", () => {
    for (const [stackId, starter] of Object.entries(STARTER_TEMPLATES)) {
      const entries = Object.entries(starter.files);
      expect(starter.name, stackId).toMatch(/^[a-z0-9-]+$/);
      expect(entries.length, stackId).toBeGreaterThan(0);

      for (const [path, content] of entries) {
        expect(path, `${stackId}:${path}`).not.toMatch(/^\//);
        expect(path.split("/"), `${stackId}:${path}`).not.toContain("..");
        expect(isUploadIgnoredPath(path), `${stackId}:${path}`).toBe(false);
        expect(typeof content, `${stackId}:${path}`).toBe("string");
      }
    }
  });

  it("keeps the documented starter examples available", () => {
    expect(hasStarterTemplate("nextjs")).toBe(true);
    expect(hasStarterTemplate("astro")).toBe(true);
    expect(hasStarterTemplate("express")).toBe(true);
    expect(hasStarterTemplate("django")).toBe(true);
  });

});
