import type { Context, Next } from "hono";
import { auth } from "../lib/auth";
import { repos } from "@repo/db";

/**
 * Better Auth organization-plugin shield.
 *
 * Better Auth's organization plugin exposes endpoints inside its catch-
 * all that need a tighter role gate than the plugin's built-in access
 * controller provides:
 *
 *   READ (GET) — leak admin-tier directory data otherwise
 *     GET /api/auth/organization/list-members
 *     GET /api/auth/organization/list-invitations
 *     GET /api/auth/organization/get-active-member-role  (with ?userId=)
 *
 *   MUTATIONS (POST) — modify membership/invitations
 *     POST /api/auth/organization/invite-member
 *     POST /api/auth/organization/remove-member
 *     POST /api/auth/organization/update-member-role
 *     POST /api/auth/organization/cancel-invitation
 *     POST /api/auth/organization/leave
 *     POST /api/auth/organization/set-active
 *
 * Role policy applied here (HIGH F4 + F5):
 *
 *   - `restricted`     → 403 on every protected GET AND every protected
 *                        POST. Restricted members never touch member
 *                        management. The `leave` endpoint is intentionally
 *                        allowed (a restricted user must always be able
 *                        to exit), as is `set-active` (lets them swap
 *                        between orgs they're already in).
 *   - `member`         → may list teammates (list-members) and leave /
 *                        set-active. Everything else 403.
 *   - `admin` / `owner` → pass through to Better Auth; the plugin's own
 *                        access controller still applies for fine-grained
 *                        action gating.
 *   - unknown / no session → pass through; Better Auth handles 401.
 *
 * CRITICAL: the role lookup is performed against the TARGET org from
 * the request, NOT the session's activeOrganizationId (HIGH F5). The
 * target org is derived from the request body/query per-endpoint:
 *
 *   list-members              → ?organizationId / body.organizationId
 *   list-invitations          → ?organizationId / body.organizationId
 *   get-active-member-role    → ?organizationId
 *   invite-member             → body.organizationId
 *   remove-member             → body.organizationId
 *   update-member-role        → body.organizationId
 *   cancel-invitation         → body.organizationId (invitation org)
 *   leave                     → body.organizationId
 *   set-active                → body.organizationId
 *
 * Fall back to session.activeOrganizationId only when the request does
 * not supply one (matches Better Auth's own resolution order).
 *
 * UNIT-TEST NOTE: `restricted` is declared with an empty AC statement
 * (`ac: []` in lib/auth.ts) — Better Auth's role-merge logic treats
 * that as "no plugin-side permissions for any action". The shield
 * therefore is the ONLY thing keeping a restricted member from calling
 * these endpoints. Any future change to the restricted role's AC must
 * keep the empty-AC invariant OR move the shield into Better Auth's
 * own statement system.
 *
 * Failure-safe: if anything throws while reading the session or the
 * caller's membership, we fall through and let Better Auth respond.
 * We never confirm cross-tenant existence in the error path.
 */

//TODO: ensure the flow fully clean and secure

/** Endpoints that only need a member-tier read (current org directory). */
const READ_PATHS = new Set<string>([
  "/api/auth/organization/list-members",
  "/api/auth/organization/list-invitations",
  "/api/auth/organization/get-active-member-role",
]);

/** Mutating endpoints that restricted MUST NOT call. */
const MUTATION_PATHS = new Set<string>([
  "/api/auth/organization/invite-member",
  "/api/auth/organization/remove-member",
  "/api/auth/organization/update-member-role",
  "/api/auth/organization/cancel-invitation",
  "/api/auth/organization/leave",
  "/api/auth/organization/set-active",
]);

/**
 * Subset of MUTATION_PATHS that a `member` (or `restricted`, when they
 * already belong to the target org) must always retain so they aren't
 * trapped in an org they can't exit.
 */
const ALWAYS_ALLOWED_FOR_SELF = new Set<string>([
  "/api/auth/organization/leave",
  "/api/auth/organization/set-active",
]);

const ALL_PROTECTED = new Set<string>([...READ_PATHS, ...MUTATION_PATHS]);

async function extractTargetOrgId(
  c: Context,
  fallbackSessionOrg: string | null,
): Promise<string | null> {
  // Query string takes priority for GETs — that's how list-members
  // and friends supply the target org.
  const qsOrg = c.req.query("organizationId");
  if (typeof qsOrg === "string" && qsOrg.trim()) return qsOrg.trim();

  // POST mutations carry the target in the JSON body. We need a
  // clone-safe read because Better Auth's plugin will re-read the body
  // downstream. `c.req.raw.clone().json()` is the canonical pattern.
  if (c.req.method === "POST") {
    try {
      const cloned = c.req.raw.clone();
      const body = (await cloned.json()) as { organizationId?: unknown } | null;
      if (body && typeof body.organizationId === "string" && body.organizationId.trim()) {
        return body.organizationId.trim();
      }
    } catch {
      // Empty/malformed body — fall through to the session default.
    }
  }

  return fallbackSessionOrg;
}

export async function betterAuthShield(c: Context, next: Next) {
  // Hono's c.req.path strips query string already; normalise just in
  // case a trailing slash slips in.
  const path = c.req.path.replace(/\/+$/, "");
  if (!ALL_PROTECTED.has(path)) return next();

  // Methods other than GET/POST never hit the org plugin's mutating
  // surfaces. Skip them outright (defence in depth).
  if (c.req.method !== "GET" && c.req.method !== "POST") return next();

  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null;
  try {
    session = await auth.api.getSession({ headers: c.req.raw.headers });
  } catch {
    return next();
  }

  if (!session?.user?.id) return next();

  const sessionOrgId =
    (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;

  const targetOrgId = await extractTargetOrgId(c, sessionOrgId);
  if (!targetOrgId) {
    // No org context at all — let Better Auth surface its own 400.
    return next();
  }

  let role: string;
  try {
    const member = await repos.member.find(targetOrgId, session.user.id);
    if (!member) {
      // Caller isn't a member of the target org. Same generic 403 the
      // GET path returned before — never leak the org's existence.
      return c.json({ error: "Forbidden" }, 403);
    }
    role = member.role ?? "member";
  } catch {
    return next();
  }

  // Owners / admins: full access to the plugin endpoints (plugin's own
  // AC still applies for finer gating).
  if (role === "owner" || role === "admin") return next();

  // Restricted: deny every protected endpoint EXCEPT leave/set-active
  // (a restricted member must always be able to exit / swap orgs).
  if (role === "restricted") {
    if (ALWAYS_ALLOWED_FOR_SELF.has(path)) return next();
    return c.json({ error: "Forbidden" }, 403);
  }

  // Regular member.
  if (role === "member") {
    if (path === "/api/auth/organization/list-members") return next();
    if (ALWAYS_ALLOWED_FOR_SELF.has(path)) return next();
    return c.json({ error: "Forbidden" }, 403);
  }

  // Unknown role: fail closed.
  return c.json({ error: "Forbidden" }, 403);
}
