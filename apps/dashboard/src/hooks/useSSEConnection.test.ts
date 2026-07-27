import { describe, expect, it, vi } from "vitest";

import { createLogStreamHandle } from "./log-stream-handle";

describe("createLogStreamHandle", () => {
  it("keeps one handle while exposing the latest connection state", async () => {
    const connect = vi.fn(async () => {});
    const disconnect = vi.fn();
    const stateRef = {
      current: {
        isConnected: false,
        isConnecting: true,
        error: null as Error | null,
      },
    };
    const handle = createLogStreamHandle(connect, disconnect, stateRef);

    expect(handle.isConnected).toBe(false);
    expect(handle.isConnecting).toBe(true);

    stateRef.current = {
      isConnected: true,
      isConnecting: false,
      error: null,
    };

    expect(handle.isConnected).toBe(true);
    expect(handle.isConnecting).toBe(false);
    expect(handle.connect).toBe(connect);
    expect(handle.disconnect).toBe(disconnect);

    await handle.connect("projects/project-1/logs/stream");
    handle.disconnect();
    expect(connect).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
