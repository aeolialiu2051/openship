import { describe, expect, it } from "vitest";
import { decodeSlug, encodeTemplateSlug } from "./repoSlug";

describe("template deployment slugs", () => {
  it("round-trips as a template source rather than a GitHub repository", () => {
    expect(decodeSlug(encodeTemplateSlug("nextjs"))).toEqual({
      kind: "template",
      stackId: "nextjs",
    });
  });
});
