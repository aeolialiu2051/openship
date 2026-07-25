import { describe, expect, it } from "vitest";
import {
  appendProjectRouteKey,
  generateProjectRouteKey,
  normalizeProjectRouteKey,
  projectRoutingSlug,
  removeProjectRouteKey,
  replaceProjectRouteKey,
} from "./project-route-key";

describe("project route keys", () => {
  it("generates DNS-safe six-character Base36 keys", () => {
    expect(generateProjectRouteKey()).toMatch(/^[a-z0-9]{6}$/);
    expect(normalizeProjectRouteKey("OO198W")).toBe("oo198w");
    expect(() => normalizeProjectRouteKey("too-long")).toThrow();
  });

  it("appends the key idempotently", () => {
    const first = appendProjectRouteKey("abc", "oo198w");
    expect(first).toBe("abc-oo198w");
    expect(appendProjectRouteKey(first, "oo198w")).toBe(first);
    expect(appendProjectRouteKey("SeekPeace-backend-db", "oo198w"))
      .toBe("seekpeace-backend-db-oo198w");
  });

  it("keeps the complete DNS label within 63 characters", () => {
    const label = appendProjectRouteKey("a".repeat(100), "oo198w");
    expect(label).toHaveLength(63);
    expect(label).toMatch(/-oo198w$/);

    const namespaced = `frontend-${label}`;
    const idempotent = appendProjectRouteKey(namespaced, "oo198w");
    expect(idempotent).toHaveLength(63);
    expect(idempotent).toMatch(/-oo198w$/);
  });

  it("removes and replaces only the requested project key", () => {
    expect(removeProjectRouteKey("abc-oo198w", "oo198w")).toBe("abc");
    expect(removeProjectRouteKey("abc-wkf0zl", "oo198w")).toBe("abc-wkf0zl");
    expect(replaceProjectRouteKey("abc-oo198w", "oo198w", "wkf0zl"))
      .toBe("abc-wkf0zl");
  });

  it("derives the routing slug without changing the project slug", () => {
    const project = { slug: "ABC Store", routeKey: "4gssqa" };
    expect(projectRoutingSlug(project)).toBe("abc-store-4gssqa");
    expect(project.slug).toBe("ABC Store");
  });
});
