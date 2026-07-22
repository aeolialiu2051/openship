import { describe, expect, it } from "vitest";

import {
  alignLoopbackOrigin,
  resolveProxyWebSocketApiBase,
} from "./urls";

describe("alignLoopbackOrigin", () => {
  it("rewrites a 127.0.0.1 API origin when the page is served from localhost", () => {
    // The bug in #27: dashboard on localhost:3001, API injected as 127.0.0.1:4000.
    // Cross-site for the browser, so the session cookie is dropped.
    expect(alignLoopbackOrigin("http://127.0.0.1:4000", "http://localhost:3001")).toBe(
      "http://localhost:4000",
    );
  });

  it("rewrites the other way round too", () => {
    expect(alignLoopbackOrigin("http://localhost:4000", "http://127.0.0.1:3001")).toBe(
      "http://127.0.0.1:4000",
    );
  });

  it("leaves the origin alone when hosts already match", () => {
    expect(alignLoopbackOrigin("http://localhost:4000", "http://localhost:3001")).toBe(
      "http://localhost:4000",
    );
  });

  it("does not touch non-loopback origins", () => {
    expect(alignLoopbackOrigin("https://api.example.com", "http://localhost:3001")).toBe(
      "https://api.example.com",
    );
    expect(alignLoopbackOrigin("http://127.0.0.1:4000", "https://app.example.com")).toBe(
      "http://127.0.0.1:4000",
    );
  });

  it("passes a malformed override through unchanged", () => {
    expect(alignLoopbackOrigin("not a url", "http://localhost:3001")).toBe("not a url");
  });
});

describe("resolveProxyWebSocketApiBase", () => {
  it("routes a Compose dashboard socket through the same-origin Upgrade path", () => {
    expect(
      resolveProxyWebSocketApiBase(
        "http://localhost:3001",
        "http://localhost:4000",
      ),
    ).toBe("http://localhost:3001/_openship/ws/api/");
  });

  it("preserves the loopback hostname used to open the dashboard", () => {
    expect(
      resolveProxyWebSocketApiBase(
        "http://127.0.0.1:3001",
        "http://localhost:4000",
      ),
    ).toBe("http://127.0.0.1:3001/_openship/ws/api/");
  });

  it("uses the same-origin edge WebSocket prefix on a public dashboard", () => {
    expect(
      resolveProxyWebSocketApiBase(
        "https://app.example.com",
        "http://localhost:4000",
      ),
    ).toBe("https://app.example.com/_openship/ws/api/");
  });
});
