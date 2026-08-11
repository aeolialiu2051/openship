import { describe, expect, it } from "vitest";
import { allowsCollectionEmbedding, hasRenderableHtml } from "./collection-preview";

function headers(values: Record<string, string>) {
  return new Headers(values);
}

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

describe("allowsCollectionEmbedding", () => {
  it("rejects X-Frame-Options policies that block Collection cards", () => {
    expect(allowsCollectionEmbedding(headers({ "x-frame-options": "DENY" }))).toBe(false);
    expect(allowsCollectionEmbedding(headers({ "x-frame-options": "SAMEORIGIN" }))).toBe(false);
  });

  it("rejects CSP frame-ancestors none and self-only", () => {
    expect(
      allowsCollectionEmbedding(
        headers({ "content-security-policy": "default-src 'self'; frame-ancestors 'none'" }),
      ),
    ).toBe(false);
    expect(
      allowsCollectionEmbedding(
        headers({ "content-security-policy": "frame-ancestors 'self'; object-src 'none'" }),
      ),
    ).toBe(false);
  });

  it("allows pages without a blocking framing policy", () => {
    expect(allowsCollectionEmbedding(headers({ "content-type": "text/html" }))).toBe(true);
    expect(
      allowsCollectionEmbedding(
        headers({ "content-security-policy": "frame-ancestors https://vibrail.com" }),
      ),
    ).toBe(true);
  });
});
