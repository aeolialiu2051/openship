import { describe, expect, it } from "vitest";
import { getSiteUrl } from "./siteUrl";

describe("getSiteUrl", () => {
  it("adds HTTPS to a hostname", () => {
    expect(getSiteUrl("example.com")).toBe("https://example.com");
  });

  it("preserves an existing HTTPS URL", () => {
    expect(getSiteUrl("https://example.com")).toBe("https://example.com");
  });

  it("preserves an existing HTTP URL", () => {
    expect(getSiteUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });
});
