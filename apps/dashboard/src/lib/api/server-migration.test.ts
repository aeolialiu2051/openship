import { afterEach, describe, expect, it, vi } from "vitest";

import { dockerMigrationApi } from "./server-migration";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("dockerMigrationApi.scanStream", () => {
  it("rejects a heartbeat-only stalled stream so the caller can use JSON fallback", async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'event: progress\ndata: {"type":"progress","message":"Listing containers…"}\n\n',
          ),
        );
        controller.enqueue(encoder.encode('event: ping\ndata: {}\n\n'));
        // Deliberately leave the stream open: this reproduces a production
        // proxy/backend path whose heartbeats continue but terminal result is
        // never delivered.
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { headers: { "content-type": "text/event-stream" } })),
    );
    const onProgress = vi.fn();

    const pending = dockerMigrationApi.scanStream("server-1", { onProgress });
    const rejected = expect(pending).rejects.toThrow("Scan stream stalled without progress");
    await vi.advanceTimersByTimeAsync(90_001);

    await rejected;
    expect(onProgress).toHaveBeenCalledWith("Listing containers…");
  });
});
