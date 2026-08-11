import { describe, expect, it } from "vitest";
import {
  buildAuthPageHref,
  getPostAuthRedirect,
  resolveReturnToDestination,
  validateReturnTo,
} from "./cloud-auth";

describe("collection authentication return path", () => {
  it("allows a collection engagement continuation", () => {
    const returnTo = "/collection?project=project-1&intent=comment";
    expect(validateReturnTo(returnTo)).toBe(returnTo);
    expect(getPostAuthRedirect(new URLSearchParams({ returnTo }))).toBe(returnTo);
  });

  it("preserves the return path when switching to registration", () => {
    const returnTo = "/collection?project=project-1&intent=like";
    expect(buildAuthPageHref("/register", new URLSearchParams({ returnTo }))).toBe(
      `/register?returnTo=${encodeURIComponent(returnTo)}`,
    );
  });

  it("rejects external redirects", () => {
    expect(validateReturnTo("//evil.example/collection")).toBeNull();
    expect(validateReturnTo("https://evil.example/collection")).toBeNull();
  });

  it("returns from the local Dashboard to the local Web collection", () => {
    expect(
      resolveReturnToDestination(
        "/collection?project=project-1&intent=like",
        "http://localhost:3002",
      ),
    ).toBe("http://localhost:3009/collection?project=project-1&intent=like");
  });

  it("uses an absolute hosted return so Dashboard basePath is not applied", () => {
    expect(resolveReturnToDestination("/collection", "https://vibrail.com")).toBe(
      "https://vibrail.com/collection",
    );
  });
});
