import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

describe("API proxy streaming cancellation", () => {
  const originalFetch = globalThis.fetch;
  const originalProxyFlag = process.env.NEXT_PUBLIC_API_PROXY;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.NEXT_PUBLIC_API_PROXY = originalProxyFlag;
    vi.restoreAllMocks();
  });

  it("aborts the upstream fetch when the downstream response is cancelled", async () => {
    process.env.NEXT_PUBLIC_API_PROXY = "true";
    const upstreamCancel = vi.fn();
    let forwardedSignal: AbortSignal | undefined;
    globalThis.fetch = vi.fn(async (_input, init) => {
      forwardedSignal = init?.signal ?? undefined;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(": connected\n\n"));
          },
          cancel: upstreamCancel,
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    });

    const response = await GET(
      new NextRequest("http://dashboard.test/api/proxy/api/system/monitor/stream"),
      { params: Promise.resolve({ path: ["api", "system", "monitor", "stream"] }) },
    );
    expect(forwardedSignal?.aborted).toBe(false);

    await response.body?.cancel("page-left");

    expect(forwardedSignal?.aborted).toBe(true);
    expect(upstreamCancel).toHaveBeenCalled();
  });

  it("propagates an inbound request abort to the upstream fetch", async () => {
    process.env.NEXT_PUBLIC_API_PROXY = "true";
    const inbound = new AbortController();
    let forwardedSignal: AbortSignal | undefined;
    globalThis.fetch = vi.fn((_input, init) => {
      forwardedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        forwardedSignal?.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      });
    });

    const responsePromise = GET(
      new NextRequest("http://dashboard.test/api/proxy/api/health", {
        signal: inbound.signal,
      }),
      { params: Promise.resolve({ path: ["api", "health"] }) },
    );
    await vi.waitFor(() => expect(forwardedSignal).toBeDefined());
    inbound.abort("client-left");
    await responsePromise;

    expect(forwardedSignal?.aborted).toBe(true);
  });
});
