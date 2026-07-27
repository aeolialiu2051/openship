import { readFile, stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATES } from "@repo/core";
import { materializeStarterTemplate } from "../../../src/modules/deployments/template-source";

describe("built-in template source", () => {
  it("materializes trusted starter files without provisioning a workspace", async () => {
    const root = await materializeStarterTemplate("nextjs");

    expect((await stat(root)).isDirectory()).toBe(true);
    expect(await readFile(`${root}/package.json`, "utf8")).toBe(
      STARTER_TEMPLATES.nextjs.files["package.json"],
    );
    expect(await readFile(`${root}/app/page.jsx`, "utf8")).toContain("Next.js Starter");
  });

  it("rejects a stack that has no built-in source", async () => {
    await expect(materializeStarterTemplate("angular")).rejects.toThrow(/not available/i);
  });
});
