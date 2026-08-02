import type { Context } from "hono";
import { LEGACY_PAT_PREFIX, PAT_PREFIX } from "./pat";

/**
 * Parse a `Authorization: Bearer <token>` header. Single source of truth for
 * both the auth middleware and the MCP endpoint — the regex must stay identical
 * so a token authenticates the same way on every route.
 */
export function parseBearerToken(c: Context): string | null {
  const raw = c.req.header("authorization") ?? c.req.header("Authorization");
  const m = raw ? /^bearer\s+(.+)$/i.exec(raw.trim()) : null;
  return m ? m[1]!.trim() : null;
}

/** True for a current Vibrail PAT or a legacy OpenShip PAT. */
export function isPatToken(token: string | null): token is string {
  return !!token && (token.startsWith(PAT_PREFIX) || token.startsWith(LEGACY_PAT_PREFIX));
}
