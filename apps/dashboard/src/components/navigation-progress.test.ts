import { describe, expect, it } from "vitest";
import { isInternalNavigationAnchor } from "./navigation-progress";

function anchor(href: string, options: { target?: string; rel?: string; download?: boolean } = {}) {
  return {
    href: new URL(href, "https://app.example.com/current").href,
    target: options.target ?? "",
    hasAttribute: (name: string) => name === "download" && options.download === true,
    getAttribute: (name: string) => {
      if (name === "href") return href;
      if (name === "rel") return options.rel ?? null;
      return null;
    },
  } as HTMLAnchorElement;
}

describe("isInternalNavigationAnchor", () => {
  const current = new URL("https://app.example.com/current?tab=one");

  it("accepts a different same-origin route", () => {
    expect(isInternalNavigationAnchor(anchor("/projects"), current)).toBe(true);
  });

  it("accepts a same-path query navigation", () => {
    expect(isInternalNavigationAnchor(anchor("/current?tab=two"), current)).toBe(true);
  });

  it("ignores external, hash-only, download, and new-tab links", () => {
    expect(isInternalNavigationAnchor(anchor("https://docs.example.com"), current)).toBe(false);
    expect(isInternalNavigationAnchor(anchor("#section"), current)).toBe(false);
    expect(isInternalNavigationAnchor(anchor("/export", { download: true }), current)).toBe(false);
    expect(isInternalNavigationAnchor(anchor("/projects", { target: "_blank" }), current)).toBe(false);
    expect(isInternalNavigationAnchor(anchor("/projects", { rel: "external" }), current)).toBe(false);
  });
});
