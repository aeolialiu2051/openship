import { describe, expect, it } from "vitest";
import { cleanPath, cleanReferrer } from "./telemetry.controller";

describe("page-view telemetry sanitization", () => {
  it("stores only a valid pathname", () => {
    expect(cleanPath("/projects/123?token=secret#details")).toBe("/projects/123");
    expect(cleanPath("https://example.com/projects")).toBeNull();
    expect(cleanPath(42)).toBeNull();
  });

  it("removes referrer query strings and fragments", () => {
    expect(cleanReferrer("https://vibrail.dev/projects/1?token=secret#x")).toBe(
      "https://vibrail.dev/projects/1",
    );
    expect(cleanReferrer("not a url")).toBeNull();
  });
});
