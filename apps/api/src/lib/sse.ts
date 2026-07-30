/**
 * Drop-in replacement for Hono's `streamSSE` with automatic keep-alive.
 * Sends a ping every HEARTBEAT_INTERVAL_MS to prevent proxy/CDN drops.
 */

import type { Context } from "hono";
import type { SSEStreamingApi } from "hono/streaming";
import { streamSSE as _streamSSE } from "hono/streaming";
import { SYSTEM } from "@repo/core";

export function streamSSE(
  c: Context,
  cb: (stream: SSEStreamingApi) => Promise<void>,
) {
  // Disable reverse-proxy response buffering. nginx/Traefik buffer proxied
  // responses by default, which holds SSE events back until the buffer fills —
  // the stream lags or appears stuck once deployed behind Traefik, even
  // though localhost (no proxy) streams fine. nginx turns off proxy_buffering
  // for any response carrying this header. Must be set before streamSSE()
  // commits the headers; it never sets X-Accel-Buffering itself, so this
  // survives. The dashboard's /api/proxy relays it (not a hop-by-hop header),
  // so it reaches the edge through both the direct and proxied request paths.
  c.header("X-Accel-Buffering", "no");

  return _streamSSE(c, async (sseStream) => {
    // Commit the response immediately. Runtime log streams can legitimately
    // have no history and no new output; without an initial byte, fetch-based
    // proxies and some Traefik middleware keep the browser in "connecting"
    // until the first 25s heartbeat arrives.
    await sseStream.write(": connected\n\n");

    const heartbeat = setInterval(() => {
      void sseStream
        .writeSSE({ event: "ping", data: "{}" })
        .catch(() => {});
    }, SYSTEM.SSE.HEARTBEAT_INTERVAL_MS);

    sseStream.onAbort(() => clearInterval(heartbeat));

    try {
      await cb(sseStream);
    } finally {
      clearInterval(heartbeat);
    }
  });
}
