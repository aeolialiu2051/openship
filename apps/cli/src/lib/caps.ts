/**
 * Capability discovery. GET /api/health/env is unauthenticated and returns the
 * deployment shape (self-hosted vs cloud, deploy/auth/team modes, cloud URLs).
 * Results are cached into the active context so [self-host] commands can gate
 * without a round-trip on every invocation.
 */
import type { ContextCaps } from "./config";
import { getActiveContext, getContext, updateContext } from "./config";
import { apiRequest, ApiError } from "./api-client";

export type { ContextCaps } from "./config";

/** Cache lifetime before fetchCaps re-hits the API. */
const CAPS_TTL_MS = 5 * 60_000;

interface HealthEnvResponse {
  selfHosted?: boolean;
  userServers?: boolean;
  deployMode?: string;
  authMode?: string;
  teamMode?: string;
  cloudAuthUrl?: string | null;
  cloudApiUrl?: string | null;
}

/** Cached caps for a context (defaults to active), or null if none/stale-agnostic. */
export function getCachedCaps(context?: string): ContextCaps | null {
  return getContext(context).caps ?? null;
}

/**
 * Fetch and cache capabilities for a context (defaults to active). Returns the
 * cached value when fresh unless `force` is set. Throws ApiError on failure.
 */
export async function fetchCaps(opts?: { force?: boolean; context?: string }): Promise<ContextCaps> {
  const name = opts?.context ?? getActiveContext();
  const cached = getContext(name).caps;
  if (
    !opts?.force &&
    cached &&
    typeof cached.userServers === "boolean" &&
    Date.now() - cached.fetchedAt < CAPS_TTL_MS
  ) {
    return cached;
  }

  const body = await apiRequest<HealthEnvResponse>("/health/env");
  const caps: ContextCaps = {
    selfHosted: body.selfHosted ?? true,
    userServers: body.userServers ?? body.selfHosted ?? true,
    deployMode: body.deployMode ?? "unknown",
    authMode: body.authMode ?? "unknown",
    teamMode: body.teamMode ?? "single_user",
    cloudAuthUrl: body.cloudAuthUrl ?? null,
    cloudApiUrl: body.cloudApiUrl ?? null,
    fetchedAt: Date.now(),
  };
  updateContext(name, { caps });
  return caps;
}

/**
 * Gate a [self-host] command. Throws (with status 400) when the active target
 * is Vibrail Cloud, so cloud users get a clean message instead of a 404/403.
 */
export function requireSelfHost(caps: ContextCaps): void {
  if (!caps.selfHosted) {
    throw new ApiError(
      "This command is only available on a self-hosted Vibrail instance, not on Vibrail Cloud.",
      400,
      null,
    );
  }
}

/** Gate commands backed by the explicit user-owned-server API capability. */
export function requireUserServers(caps: ContextCaps): void {
  // Old cached configs did not contain userServers. Self-hosted instances have
  // always supported the server surface, so retain that safe fallback.
  if (caps.userServers === true || (caps.userServers === undefined && caps.selfHosted)) return;
  throw new ApiError(
    "This Vibrail instance does not allow managing user-owned servers.",
    400,
    null,
  );
}
