import type { Context, Next } from "hono";
import { ForbiddenError } from "@repo/core";
import { repos } from "@repo/db";
import { getRequestContext } from "../../lib/request-context";

export function canAccessInstanceAdmin(
  role: string | null | undefined,
  sessionKind: "cookie" | "bearer" | "zero-auth",
): boolean {
  return role === "admin" && sessionKind !== "bearer";
}

/**
 * Instance administration is deliberately separate from organization roles.
 * An owner/admin membership only governs one workspace; this gate checks the
 * canonical platform-level `user.role` field instead.
 *
 * Browser sessions (and the loopback-only zero-auth desktop session) are
 * accepted. Bearer credentials are refused even when they belong to an admin:
 * a leaked PAT/OAuth token must not become a global control-plane credential.
 */
export async function requireInstanceAdmin(c: Context, next: Next) {
  const ctx = getRequestContext(c);
  if (ctx.sessionKind === "bearer") {
    throw new ForbiddenError("Instance administration requires a browser session");
  }

  const user = await repos.user.findById(ctx.userId);
  if (!canAccessInstanceAdmin(user?.role, ctx.sessionKind)) {
    throw new ForbiddenError("Instance administrator access required");
  }

  await next();
}
