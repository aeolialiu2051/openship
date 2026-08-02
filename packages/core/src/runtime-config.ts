export const DEFAULT_PORT = {
  web: 3000,
  dashboard: 3001,
  api: 4000,
  vibrailSaasDashboard: 3002,
  vibrailSaasApi: 4100,
} as const;

const localhost = (port: number) => `http://localhost:${port}`;

/**
 * Keep upgrades from existing OpenShip installs working while Vibrail becomes
 * the canonical public prefix. Explicit VIBRAIL_* values always win.
 */
if (typeof process !== "undefined" && process.env) {
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("OPENSHIP_") || value === undefined) continue;
    const vibrailKey = `VIBRAIL_${key.slice("OPENSHIP_".length)}`;
    process.env[vibrailKey] ??= value;
  }
}

// Standalone URL exports — consumed by desktop, CLI, and onboarding
// flows that want "the localhost dashboard URL" without going through
// the runtime-target table. They're the same strings used inside
// DASHBOARD_RUNTIME_TARGETS below; single source for each value.
export const LOCAL_WEB_URL = localhost(DEFAULT_PORT.web);
export const LOCAL_DASHBOARD_URL = localhost(DEFAULT_PORT.dashboard);
export const LOCAL_API_URL = localhost(DEFAULT_PORT.api);

// The production cloud endpoints. HOST_DOMAIN changes the shared hosted origin
// without a source edit (a bare hostname is served over HTTPS; a full URL keeps
// its explicit scheme). The VIBRAIL_CLOUD_* variables remain the highest-
// priority per-endpoint overrides, which is useful when API and dashboard use
// different origins or when local development needs HTTP ports.
const envUrl = (key: string): string | undefined => {
  const v = typeof process !== "undefined" ? process.env?.[key] : undefined;
  return v && v.trim() ? v.trim() : undefined;
};

const hostedOrigin = (() => {
  const configured = envUrl("HOST_DOMAIN");
  if (!configured) return "https://vibrail.warpgateapi.com";
  const withoutTrailingSlash = configured.replace(/\/+$/, "");
  return /^[a-z][a-z\d+.-]*:\/\//i.test(withoutTrailingSlash)
    ? withoutTrailingSlash
    : `https://${withoutTrailingSlash}`;
})();

export const CLOUD_DASHBOARD_URL =
  envUrl("VIBRAIL_CLOUD_DASHBOARD_URL") ?? hostedOrigin;
// Hosted Vibrail serves the dashboard and API on one public origin. General
// API routes pass through the dashboard's Next.js catch-all proxy; callers
// append their normal `/api/...` paths to this base.
export const CLOUD_API_URL =
  envUrl("VIBRAIL_CLOUD_API_URL") ?? `${hostedOrigin}/api/proxy`;

/**
 * THE runtime-target table. Keyed by id — the id IS the key, no
 * redundant `id` field on the row. To enable a runtime target,
 * uncomment its entry. VIBRAIL_TARGET picks one row.
 *
 *   VIBRAIL_TARGET=local         (default — self-hosted; talks to vibrail-saas)
 *   VIBRAIL_TARGET=vibrail-saas  (Vibrail's hosted SaaS)
 *
 * No NODE_ENV magic, no CLOUD_MODE-based inference. Invalid value
 * throws — fail-loud beats silently picking the wrong URL.
 */
export const DASHBOARD_RUNTIME_TARGETS = {
  local: {
    dashboard: LOCAL_DASHBOARD_URL,
    api: LOCAL_API_URL,
    ports: { dashboard: DEFAULT_PORT.dashboard, api: DEFAULT_PORT.api },
    cloudTargetId: "vibrail-saas",
    selfHosted: true,
    userServers: true,
  },
  "vibrail-saas": {
    dashboard: CLOUD_DASHBOARD_URL,
    api: CLOUD_API_URL,
    ports: {
      dashboard: DEFAULT_PORT.vibrailSaasDashboard,
      api: DEFAULT_PORT.vibrailSaasApi,
    },
    // Self-referential: Vibrail Cloud owns its managed deployment runtime.
    // Local development overrides VIBRAIL_CLOUD_* to localhost explicitly.
    cloudTargetId: "vibrail-saas",
    selfHosted: false,
    // Vibrail Cloud can orchestrate connected user-owned VPS targets.
    userServers: true,
  },
} as const;

// NOTE: this table is the source of truth for WHO an instance is (identity,
// URLs, ports) plus platform capabilities such as self-hosting and user-owned
// server orchestration. It deliberately does NOT carry
// deploy/build mode (docker | bare | cloud | desktop): that's an orthogonal
// axis a single instance varies independently (a self-hosted box runs docker,
// bare, or desktop), owned by the API's env (DEPLOY_MODE/CLOUD_MODE) and
// surfaced to the dashboard via GET /health/env. Keeping a copy here only bred
// drift (e.g. local→"docker" while DEPLOY_MODE=desktop).

export type DashboardRuntimeTargetId = keyof typeof DASHBOARD_RUNTIME_TARGETS;
export type DashboardRuntimeTarget = (typeof DASHBOARD_RUNTIME_TARGETS)[DashboardRuntimeTargetId];

// SINGLE knob, resolved ONCE at module load. process.env.VIBRAIL_TARGET
// picks the row. Invalid value throws fail-loud.
const rawTarget =
  (typeof process !== "undefined" ? process.env?.VIBRAIL_TARGET : undefined) ?? "local";
if (!(rawTarget in DASHBOARD_RUNTIME_TARGETS)) {
  throw new Error(
    `VIBRAIL_TARGET="${rawTarget}" is not a valid runtime target. ` +
      `Use one of: ${Object.keys(DASHBOARD_RUNTIME_TARGETS).join(", ")}.`,
  );
}

export const runtimeTargetId = rawTarget as DashboardRuntimeTargetId;
export const runtimeTarget = DASHBOARD_RUNTIME_TARGETS[runtimeTargetId];

// Optional override for WHERE "cloud" points. A self-hosted instance normally
// talks to vibrail-saas. Local development keeps the same target id and
// overrides VIBRAIL_CLOUD_DASHBOARD_URL / VIBRAIL_CLOUD_API_URL to localhost.
// Unset/invalid → falls back to the active target's own cloudTargetId.
const rawCloudTarget =
  typeof process !== "undefined" ? process.env?.VIBRAIL_CLOUD_TARGET : undefined;
export const cloudRuntimeTargetId: DashboardRuntimeTargetId =
  rawCloudTarget && rawCloudTarget in DASHBOARD_RUNTIME_TARGETS
    ? (rawCloudTarget as DashboardRuntimeTargetId)
    : runtimeTarget.cloudTargetId;
export const cloudRuntimeTarget = DASHBOARD_RUNTIME_TARGETS[cloudRuntimeTargetId];

// Every dashboard + api origin from the table — used for CORS allowlists.
export const dashboardRuntimeOrigins = Object.values(DASHBOARD_RUNTIME_TARGETS).flatMap(
  ({ dashboard, api }) => [dashboard, api],
);

export const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Align a loopback origin with the loopback host of a reference origin.
 *
 * `localhost` and `127.0.0.1` are the same machine but *different sites* to a
 * browser: a request between them is cross-site, so a host-only SameSite=Lax
 * cookie minted on one host is never sent to the other. Rewriting the hostname
 * (port + protocol of `injected` preserved) keeps the pair same-site. Only
 * touches origins where BOTH are loopback — non-loopback (production) origins
 * pass through untouched, so this can never redirect off-box.
 *
 * Shared by the dashboard (align the injected API origin to the page host) and
 * the API (align the desktop-login redirect target to the request host).
 */
export function alignLoopbackOrigin(injected: string, referenceOrigin: string): string {
  try {
    const target = new URL(injected);
    const reference = new URL(referenceOrigin);
    if (!LOOPBACK_HOSTNAMES.has(target.hostname) || !LOOPBACK_HOSTNAMES.has(reference.hostname)) {
      return injected;
    }
    target.hostname = reference.hostname;
    return `${target.protocol}//${target.host}`;
  } catch {
    // A malformed origin is passed through untouched — callers already tolerate
    // a bad origin, and repairing it here would hide the real config bug.
    return injected;
  }
}
