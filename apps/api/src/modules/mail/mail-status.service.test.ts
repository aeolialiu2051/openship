import { describe, expect, it, vi } from "vitest";
import { readMailStatusState } from "./mail-status.service";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("readMailStatusState", () => {
  it("fast-fails an unreachable server without starting an SSH state read", async () => {
    const readRemoteState = vi.fn();
    const result = await readMailStatusState("srv-1", {
      probeReachable: vi.fn(async () => false),
      readRemoteState,
    });

    expect(result).toEqual({
      ok: false,
      reachable: false,
      code: "server_unreachable",
      message: "The mail server is currently unreachable.",
    });
    expect(readRemoteState).not.toHaveBeenCalled();
  });

  it("keeps a reachable server with no state distinct from an error", async () => {
    const result = await readMailStatusState("srv-1", {
      probeReachable: vi.fn(async () => true),
      readRemoteState: vi.fn(async () => null),
    });

    expect(result).toEqual({ ok: true, reachable: true, state: null });
  });

  it("skips the direct TCP shortcut for a jump-host connection", async () => {
    const probeReachable = vi.fn();
    const result = await readMailStatusState("srv-1", {
      shouldUseDirectProbe: vi.fn(async () => false),
      probeReachable,
      readRemoteState: vi.fn(async () => null),
    });

    expect(result).toEqual({ ok: true, reachable: true, state: null });
    expect(probeReachable).not.toHaveBeenCalled();
  });

  it("hard-bounds a wedged authenticated state read", async () => {
    vi.useFakeTimers();
    try {
      const pending = deferred<never>();
      const resultPromise = readMailStatusState(
        "srv-1",
        {
          probeReachable: vi.fn(async () => true),
          readRemoteState: vi.fn(() => pending.promise),
        },
        { reachabilityMs: 10, readMs: 25 },
      );

      await vi.advanceTimersByTimeAsync(25);
      await expect(resultPromise).resolves.toEqual({
        ok: false,
        reachable: true,
        code: "state_read_timeout",
        message: "Timed out while reading mail status from the server.",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces SSH/auth read errors instead of reporting a fresh setup", async () => {
    const result = await readMailStatusState("srv-1", {
      probeReachable: vi.fn(async () => true),
      readRemoteState: vi.fn(async () => {
        throw new Error("Permission denied (publickey)");
      }),
    });

    expect(result).toEqual({
      ok: false,
      reachable: true,
      code: "state_read_failed",
      message: "Could not read mail status: Permission denied (publickey)",
    });
  });

  it("bounds a probe that fails to honor its own timeout", async () => {
    vi.useFakeTimers();
    try {
      const pending = deferred<boolean>();
      const readRemoteState = vi.fn();
      const resultPromise = readMailStatusState(
        "srv-1",
        {
          probeReachable: vi.fn(() => pending.promise),
          readRemoteState,
        },
        { reachabilityMs: 20, readMs: 20 },
      );

      await vi.advanceTimersByTimeAsync(20);
      await expect(resultPromise).resolves.toMatchObject({
        ok: false,
        reachable: false,
        code: "server_unreachable",
      });
      expect(readRemoteState).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
