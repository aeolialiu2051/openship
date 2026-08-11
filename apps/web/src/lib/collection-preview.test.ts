import { describe, expect, it } from "vitest";
import { hasRenderableHtml } from "./collection-preview";

describe("hasRenderableHtml", () => {
  it("rejects empty and styling-only documents", () => {
    expect(hasRenderableHtml("<!doctype html><html><body></body></html>")).toBe(false);
    expect(hasRenderableHtml("<body><style>body { background: white }</style></body>")).toBe(false);
  });

  it("accepts server-rendered pages and client application shells", () => {
    expect(hasRenderableHtml("<body><main>Dashboard</main></body>")).toBe(true);
    expect(
      hasRenderableHtml('<body><div id="root"></div><script type="module" src="/app.js"></script></body>'),
    ).toBe(true);
  });

  it("accepts visual documents without text", () => {
    expect(hasRenderableHtml('<body><canvas id="app"></canvas></body>')).toBe(true);
  });
});
