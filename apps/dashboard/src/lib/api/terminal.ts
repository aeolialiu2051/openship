/**
 * Interactive terminal API client.
 *
 * The flow:
 *
 *   1. Browser cannot set Authorization headers on a WebSocket() call,
 *      and we refuse to authenticate via query string (leaks into proxy
 *      logs). So:
 *
 *   2. Dashboard hits POST /api/terminal/ticket with the normal Better
 *      Auth cookie, gets a one-shot opaque token.
 *
 *   3. Dashboard opens `new WebSocket(url, ["openship.terminal.v1+<token>"])`.
 *      The token rides in `Sec-WebSocket-Protocol`. The server consumes
 *      it before the channel opens — single-use, ~30s TTL, bound to
 *      (userId, serverId).
 */

import { api } from "./client";
import { endpoints } from "./endpoints";
import { getWebSocketApiBaseUrl } from "./urls";

// The protocol prefix MUST match the constant in the API controller
// (apps/api/src/modules/terminal/terminal.controller.ts). The server
// echoes the same subprotocol back so the browser accepts the upgrade.
export const TERMINAL_SUBPROTOCOL_PREFIX = "openship.terminal.v1+";
// Optional second subprotocol carrying a resume token. Presented by
// the client to reattach to a parked session (page reload, network
// blip). The server validates ownership + freshness and either
// reattaches or replies with error code "resume_failed".
export const TERMINAL_RESUME_SUBPROTOCOL_PREFIX = "openship.terminal.resume+";

// ─── Wire-level control messages (server → client) ──────────────────────────

export interface ReadyMsg {
  type: "ready";
  sessionId: string;
  /**
   * Per-session secret to be stored client-side and presented in the
   * `openship.terminal.resume+<token>` subprotocol on the next WS
   * open. Survives page reload via localStorage.
   */
  resumeToken: string;
  /** True when this `ready` is the result of attaching to a parked
   *  session (not opening a fresh shell). */
  resumed: boolean;
}

export interface ExitMsg {
  type: "exit";
  code: number | null;
  signal?: string;
}

export type TerminalErrorCode =
  | "ssh_auth"
  | "ssh_connect"
  | "server_not_found"
  | "max_sessions"
  | "idle_timeout"
  | "session_cap"
  | "resume_failed"
  | "server_error"
  // Service-terminal-specific codes — emitted by the service variant
  // of the controller. The union lives here because the WS wire
  // protocol is shared with the server terminal endpoint.
  | "not_deployed"
  | "not_supported";

export interface ErrorMsg {
  type: "error";
  code: TerminalErrorCode;
  message: string;
}

export interface PongMsg {
  type: "pong";
}

export type ServerControlMsg = ReadyMsg | ExitMsg | ErrorMsg | PongMsg;

// ─── Wire-level control messages (client → server) ──────────────────────────

export interface ResizeMsg {
  type: "resize";
  cols: number;
  rows: number;
}

export interface PingMsg {
  type: "ping";
}

export type ClientControlMsg = ResizeMsg | PingMsg;

// ─── HTTP: request a handshake ticket ───────────────────────────────────────

export interface TerminalTicketResponse {
  success: boolean;
  token: string;
  expiresIn: number;
}

export async function requestTerminalTicket(serverId: string): Promise<TerminalTicketResponse> {
  return api.post<TerminalTicketResponse>(endpoints.terminal.ticket, { serverId });
}

// ─── WS URL construction ────────────────────────────────────────────────────

/**
 * Build a WebSocket URL from the dedicated Upgrade-capable API base. In
 * production proxy mode this is a same-origin path owned by the dashboard
 * front server; direct dev mode still uses the configured API origin.
 */
export function buildTerminalWsUrl(serverId: string): string {
  const base = getWebSocketApiBaseUrl();
  const url = new URL(endpoints.terminal.wsPath(serverId), base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
