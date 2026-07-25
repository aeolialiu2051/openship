import type { CommandExecutor } from "@repo/adapters";
import { safeErrorMessage } from "@repo/core";
import { repos } from "@repo/db";
import { sshManager } from "../../lib/ssh-manager";
import { readState, type MailServerState } from "./mail-state";

/**
 * `GET /mail/status` is part of the dashboard's first-load path. It must not
 * inherit the SSH transport's much longer connect / command timeout: a dead
 * mail VPS would otherwise hold the entire page on a spinner.
 *
 * The TCP probe is the cheap negative path. A host with an open SSH port still
 * gets a separately bounded authenticated read, so bad credentials and a
 * wedged SSH daemon cannot turn into a 15-second request either.
 */
export const MAIL_STATUS_REACHABILITY_TIMEOUT_MS = 1_500;
export const MAIL_STATUS_READ_TIMEOUT_MS = 4_000;

export type MailStatusReadErrorCode =
  | "server_unreachable"
  | "state_read_timeout"
  | "state_read_failed";

export type MailStatusStateResult =
  | {
      ok: true;
      reachable: true;
      state: MailServerState | null;
    }
  | {
      ok: false;
      reachable: boolean | null;
      code: MailStatusReadErrorCode;
      message: string;
    };

interface MailStatusReaderDeps {
  shouldUseDirectProbe?(serverId: string): Promise<boolean>;
  probeReachable(serverId: string, timeoutMs: number): Promise<boolean>;
  readRemoteState(serverId: string): Promise<MailServerState | null>;
}

const defaultDeps: MailStatusReaderDeps = {
  shouldUseDirectProbe: async (serverId) => {
    const server = await repos.server.get(serverId).catch(() => undefined);
    // A target reachable only through an SSH jump host can legitimately fail
    // the manager's direct target TCP probe. Skip that negative shortcut and
    // rely on the still-bounded authenticated read instead.
    return server ? !server.sshJumpHost : false;
  },
  probeReachable: (serverId, timeoutMs) =>
    sshManager.probeReachable(serverId, timeoutMs),
  readRemoteState: (serverId) =>
    sshManager.withExecutor(serverId, async (executor: CommandExecutor) => {
      // `readState` intentionally maps a missing file to null and, through the
      // shared server-store helper, also tolerates a failed `cat`. Verify the
      // authenticated channel first so SSH/auth failures stay distinguishable
      // from a genuinely fresh server without changing server-store semantics.
      await executor.exec("true");
      return readState(executor);
    }),
};

class MailStatusReadTimeoutError extends Error {
  override readonly name = "MailStatusReadTimeoutError";
}

function withHardTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new MailStatusReadTimeoutError()),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Bounded read used only by the dashboard status endpoint. Durable mail-state
 * I/O keeps its existing tolerant semantics for setup/resume callers.
 */
export async function readMailStatusState(
  serverId: string,
  deps: MailStatusReaderDeps = defaultDeps,
  timeouts: {
    reachabilityMs?: number;
    readMs?: number;
  } = {},
): Promise<MailStatusStateResult> {
  const reachabilityMs =
    timeouts.reachabilityMs ?? MAIL_STATUS_REACHABILITY_TIMEOUT_MS;
  const readMs = timeouts.readMs ?? MAIL_STATUS_READ_TIMEOUT_MS;

  const shouldUseDirectProbe = deps.shouldUseDirectProbe
    ? await deps.shouldUseDirectProbe(serverId).catch(() => false)
    : true;
  if (shouldUseDirectProbe) {
    let reachable: boolean;
    try {
      reachable = await withHardTimeout(
        deps.probeReachable(serverId, reachabilityMs),
        reachabilityMs,
      );
    } catch {
      reachable = false;
    }

    if (!reachable) {
      return {
        ok: false,
        reachable: false,
        code: "server_unreachable",
        message: "The mail server is currently unreachable.",
      };
    }
  }

  try {
    const state = await withHardTimeout(deps.readRemoteState(serverId), readMs);
    return { ok: true, reachable: true, state };
  } catch (err) {
    if (err instanceof MailStatusReadTimeoutError) {
      return {
        ok: false,
        reachable: true,
        code: "state_read_timeout",
        message: "Timed out while reading mail status from the server.",
      };
    }
    return {
      ok: false,
      reachable: true,
      code: "state_read_failed",
      message: `Could not read mail status: ${safeErrorMessage(err)}`,
    };
  }
}
