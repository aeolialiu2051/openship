/**
 * Analytics service - request analytics, resource usage, and deployment stats.
 *
 * Source selection is deployment-mode aware:
 *   - SaaS / OpenShip Cloud: Oblien analytics is the source of truth
 *   - Self-hosted: Traefik JSON access logs are parsed and aggregated directly
 */

import { repos } from "@repo/db";
import { NotFoundError, AppError, safeErrorMessage } from "@repo/core";
import type { ResourceUsage } from "@repo/adapters";
import { resolveDeploymentRuntime } from "../../lib/deployment-runtime";
import { resolveProjectTrafficSources } from "../../lib/project-analytics";
import { getAdminOblienClient } from "../../lib/oblien-user-client";
import { cloudClient } from "../../lib/cloud/client";
import type { RequestContext } from "../../lib/request-context";
import { parseTraefikAccessLog, type TraefikRequestLog } from "../projects/traefik-access-logs";
import { resolveTraefikLogSource } from "../projects/traefik-log-source";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CloudAnalyticsBucket {
  timestamp: number;
  requests: number;
  bandwidth_in: number;
  bandwidth_out: number;
  response_time_sum: number;
  unique_visitors: number;
}

interface CloudTimeseriesResponse {
  data: CloudAnalyticsBucket[];
  meta?: { to?: number };
}

function summariseCloudBuckets(
  buckets: CloudAnalyticsBucket[],
  lastUpdated: string,
): AnalyticsSummary {
  const totalReqs = buckets.reduce((sum, bucket) => sum + bucket.requests, 0);
  const totalUnique = buckets.reduce((sum, bucket) => sum + bucket.unique_visitors, 0);
  const totalIn = buckets.reduce((sum, bucket) => sum + bucket.bandwidth_in, 0);
  const totalOut = buckets.reduce((sum, bucket) => sum + bucket.bandwidth_out, 0);
  const totalResponseTime = buckets.reduce((sum, bucket) => sum + bucket.response_time_sum, 0);

  return {
    totalRequests: totalReqs,
    uniqueVisitors: totalUnique,
    bandwidthIn: totalIn,
    bandwidthOut: totalOut,
    avgResponseTimeMs: totalReqs > 0 ? Math.round(totalResponseTime / totalReqs) : 0,
    lastUpdated,
  };
}

function buildCloudHourlyPeriods(
  buckets: CloudAnalyticsBucket[],
  fromMs: number,
  toMs: number,
): AnalyticsPeriod[] {
  const byHour = new Map<number, CloudAnalyticsBucket>();

  for (const bucket of buckets) {
    const current = byHour.get(bucket.timestamp);
    if (!current) {
      byHour.set(bucket.timestamp, { ...bucket });
      continue;
    }

    current.requests += bucket.requests;
    current.bandwidth_in += bucket.bandwidth_in;
    current.bandwidth_out += bucket.bandwidth_out;
    current.response_time_sum += bucket.response_time_sum;
    current.unique_visitors += bucket.unique_visitors;
  }

  const periods: AnalyticsPeriod[] = [];
  const startHour = Math.floor(fromMs / 3_600_000);
  const endHour = Math.floor(toMs / 3_600_000);

  for (let hourKey = startHour; hourKey <= endHour; hourKey += 1) {
    const bucketStartMs = hourKey * 3_600_000;
    const bucket = byHour.get(Math.floor(bucketStartMs / 1000));

    periods.push({
      from: new Date(bucketStartMs).toISOString(),
      to: new Date(bucketStartMs + 3_600_000).toISOString(),
      requests: bucket?.requests ?? 0,
      uniqueVisitors: bucket?.unique_visitors ?? 0,
      bandwidthIn: bucket?.bandwidth_in ?? 0,
      bandwidthOut: bucket?.bandwidth_out ?? 0,
      avgResponseTimeMs:
        bucket && bucket.requests > 0 ? Math.round(bucket.response_time_sum / bucket.requests) : 0,
      topPaths: [],
      trafficByHour: {},
    });
  }

  return periods;
}

const EMPTY_SUMMARY: AnalyticsSummary = {
  totalRequests: 0,
  uniqueVisitors: 0,
  bandwidthIn: 0,
  bandwidthOut: 0,
  avgResponseTimeMs: 0,
  lastUpdated: null,
};

/**
 * The Oblien SDK returns `{ success, data: AnalyticsBucket[], meta }`; the cloud
 * PROXY wraps that again as `{ data: <sdkResponse> }`. So the bucket array sits
 * at `.data` (admin-direct) or `.data.data` (cloud-proxied). Reading a fixed
 * depth got the WRAPPER object on the proxied path — which flat-mapped into a
 * single bogus "bucket" whose numeric fields were undefined → NaN → null totals.
 * Walk down nested data/result wrappers to the actual array regardless of depth.
 */
function extractCloudBuckets(result: unknown): CloudAnalyticsBucket[] {
  let node: unknown = result;
  for (let depth = 0; depth < 4 && node && typeof node === "object"; depth++) {
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as CloudAnalyticsBucket[];
    node = obj.data ?? obj.result;
  }
  return Array.isArray(result) ? (result as CloudAnalyticsBucket[]) : [];
}

/**
 * Surface an EXPLICIT Oblien failure envelope (`{ success: false, … }`) as a
 * thrown error so the caller returns a clean upstream error instead of parsing
 * it to an empty bucket list and rendering a misleading 0/0/0 summary.
 *
 * Deliberately conservative: it throws ONLY on an explicit `success: false`.
 * A genuine success (empty `data` = no traffic) OR any shape without that flag
 * falls through to `extractCloudBuckets` exactly as before — so this can never
 * turn a benign/empty response into a false error, only unmask a declared one.
 * (Thrown transport errors are already handled by the caller's all-failed 502.)
 *
 * Envelope: `{ success, data, meta }`, sometimes wrapped again as `{ data: … }`
 * on the proxied path (same nesting extractCloudBuckets walks).
 */
function assertCloudTimeseriesOk(raw: unknown): void {
  let node: unknown = raw;
  for (let depth = 0; depth < 4 && node && typeof node === "object"; depth++) {
    const obj = node as Record<string, unknown>;
    if (obj.success === false) {
      const detail =
        (typeof obj.error === "string" && obj.error) ||
        (typeof obj.message === "string" && obj.message) ||
        "request rejected";
      throw new Error(`Openship Cloud analytics: ${detail}`);
    }
    if (Array.isArray(obj.data)) return; // reached the bucket array — done
    node = obj.data ?? obj.result;
  }
}

async function fetchCloudTimeseries(
  organizationId: string,
  domain: string,
  params: { from: number; to: number; interval: "hour" },
): Promise<CloudTimeseriesResponse | null> {
  // Direct, no caching — always the live source of truth. (Request volume is
  // controlled on the client; see ServerAnalytics fetch dedup.)
  const client = getAdminOblienClient();
  const raw = client
    ? await client.analytics.timeseries(domain, params)
    : await cloudClient({ organizationId }).analytics.timeseries(domain, params);
  // Surface a failed fetch as an error (caller → 502) instead of masking it as
  // an empty summary; only a genuine no-traffic success falls through to [].
  assertCloudTimeseriesOk(raw);
  return { data: extractCloudBuckets(raw) };
}

export interface AnalyticsSummary {
  /** Total requests (all time) */
  totalRequests: number;
  /** Total unique visitors */
  uniqueVisitors: number;
  /** Bandwidth in bytes */
  bandwidthIn: number;
  bandwidthOut: number;
  /** Average response time in ms */
  avgResponseTimeMs: number;
  /** Last flush timestamp */
  lastUpdated: string | null;
}

export interface AnalyticsPeriod {
  /** Period start */
  from: string;
  /** Period end */
  to: string;
  requests: number;
  uniqueVisitors: number;
  bandwidthIn: number;
  bandwidthOut: number;
  avgResponseTimeMs: number;
  topPaths: { path: string; count: number }[];
  trafficByHour: Record<string, number>;
}

export interface DeploymentStats {
  totalDeployments: number;
  successfulDeployments: number;
  failedDeployments: number;
  avgBuildDurationMs: number;
  /** Deployments per day for the last N days */
  dailyCounts: { date: string; total: number; success: number; failed: number }[];
}

export interface ContainerUsageSnapshot {
  timestamp: string;
  cpuPercent: number;
  memoryMb: number;
  diskMb: number;
  networkRxBytes: number;
  networkTxBytes: number;
}

const TRAEFIK_ANALYTICS_LOG_TAIL = 5_000;

/** Aggregate one Traefik log read into the complete overview response. Keeping
 * IP sets at the overview/hour level avoids the old minute-bucket behaviour
 * that counted the same visitor repeatedly across minutes. */
export function buildTraefikAnalyticsOverview(
  requests: TraefikRequestLog[],
  fromMs: number,
  toMs: number,
): { summary: AnalyticsSummary; periods: AnalyticsPeriod[] } {
  const valid = requests
    .map((request) => ({ request, timestampMs: new Date(request.timestamp).getTime() }))
    .filter(
      (item) =>
        Number.isFinite(item.timestampMs) && item.timestampMs >= fromMs && item.timestampMs <= toMs,
    );

  if (valid.length === 0) return { summary: EMPTY_SUMMARY, periods: [] };

  const uniqueVisitors = new Set<string>();
  let bandwidthIn = 0;
  let bandwidthOut = 0;
  let responseTimeMsTotal = 0;
  let lastTimestampMs = 0;
  const byHour = new Map<
    number,
    {
      requests: number;
      visitors: Set<string>;
      bandwidthIn: number;
      bandwidthOut: number;
      responseTimeMsTotal: number;
      paths: Map<string, number>;
    }
  >();

  for (const { request, timestampMs } of valid) {
    uniqueVisitors.add(request.ip);
    bandwidthIn += request.requestSize;
    bandwidthOut += request.responseSize;
    responseTimeMsTotal += request.responseTime * 1000;
    lastTimestampMs = Math.max(lastTimestampMs, timestampMs);

    const hourKey = Math.floor(timestampMs / 3_600_000);
    const hour = byHour.get(hourKey) ?? {
      requests: 0,
      visitors: new Set<string>(),
      bandwidthIn: 0,
      bandwidthOut: 0,
      responseTimeMsTotal: 0,
      paths: new Map<string, number>(),
    };
    hour.requests += 1;
    hour.visitors.add(request.ip);
    hour.bandwidthIn += request.requestSize;
    hour.bandwidthOut += request.responseSize;
    hour.responseTimeMsTotal += request.responseTime * 1000;
    hour.paths.set(request.path, (hour.paths.get(request.path) ?? 0) + 1);
    byHour.set(hourKey, hour);
  }

  const periods: AnalyticsPeriod[] = [];
  const startHour = Math.floor(fromMs / 3_600_000);
  const endHour = Math.floor(toMs / 3_600_000);
  for (let hourKey = startHour; hourKey <= endHour; hourKey += 1) {
    const hour = byHour.get(hourKey);
    const hourStartMs = hourKey * 3_600_000;
    periods.push({
      from: new Date(hourStartMs).toISOString(),
      to: new Date(hourStartMs + 3_600_000).toISOString(),
      requests: hour?.requests ?? 0,
      uniqueVisitors: hour?.visitors.size ?? 0,
      bandwidthIn: hour?.bandwidthIn ?? 0,
      bandwidthOut: hour?.bandwidthOut ?? 0,
      avgResponseTimeMs:
        hour && hour.requests > 0 ? Math.round(hour.responseTimeMsTotal / hour.requests) : 0,
      topPaths: hour
        ? [...hour.paths.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([path, count]) => ({ path, count }))
        : [],
      trafficByHour: {},
    });
  }

  return {
    summary: {
      totalRequests: valid.length,
      uniqueVisitors: uniqueVisitors.size,
      bandwidthIn,
      bandwidthOut,
      avgResponseTimeMs: Math.round(responseTimeMsTotal / valid.length),
      lastUpdated: new Date(lastTimestampMs).toISOString(),
    },
    periods,
  };
}

// ─── Analytics summary ───────────────────────────────────────────────────────

/**
 * Fetch a project's traffic ONCE and derive BOTH the cumulative summary and the
 * hourly periods from the same buckets. The dashboard reads this single endpoint
 * so a project view makes ONE cloud round-trip, instead of the two it used to
 * (separate /summary + /periods each re-fetching the identical timeseries).
 *
 * Cloud projects read from Oblien; self-hosted projects aggregate the Traefik
 * JSON access log. `from`/`to` default to the last 24h. No caching — the SaaS is
 * the live source of truth; request volume is controlled on the client.
 */
export async function getAnalyticsOverview(
  ctx: RequestContext,
  projectId: string,
  from?: string,
  to?: string,
  domain?: string,
): Promise<{ summary: AnalyticsSummary; periods: AnalyticsPeriod[] }> {
  const project = await repos.project.findById(projectId);
  if (!project || project.organizationId !== ctx.organizationId) {
    throw new NotFoundError("Project", projectId);
  }

  // `domain` scopes to one tracked domain (validated; falls back to the primary
  // when untracked — never fetches an arbitrary cross-tenant host). Without it,
  // aggregate every tracked domain. Both handled by the one resolver.
  const sources = await resolveProjectTrafficSources(projectId, { domain });
  // No resolvable traffic source (no tracked domain / no primary / no server) is
  // a legitimate "nothing to show", NOT an error — keep the honest empty summary
  // so a fresh or domain-less project renders a clean 0-state, not an error.
  if (sources.length === 0) return { summary: EMPTY_SUMMARY, periods: [] };

  if (sources.every((source) => source.kind === "cloud")) {
    const toMs = to ? new Date(to).getTime() : Date.now();
    const fromMs = from ? new Date(from).getTime() : toMs - 24 * 60 * 60 * 1000;
    const params = { from: fromMs, to: toMs, interval: "hour" as const };
    // Do NOT swallow a cloud fetch failure into an empty summary — that made an
    // upstream outage look identical to "no traffic" (zeros with a 200). Settle
    // per-domain: use whatever succeeded, but if EVERY cloud fetch failed,
    // surface a real upstream error so the client can tell "broken" from "idle".
    const settled = await Promise.allSettled(
      sources.map((source) => fetchCloudTimeseries(ctx.organizationId, source.domain, params)),
    );
    const ok = settled.filter(
      (r): r is PromiseFulfilledResult<CloudTimeseriesResponse | null> => r.status === "fulfilled",
    );
    if (ok.length === 0) {
      const reason = settled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      throw new AppError(
        `Analytics upstream (Openship Cloud) is unavailable${reason ? `: ${safeErrorMessage(reason.reason)}` : ""}`,
        502,
        "ANALYTICS_UPSTREAM_UNAVAILABLE",
      );
    }
    const buckets = ok.flatMap((r) => r.value?.data ?? []);
    // Reached the cloud, but it reported no traffic → genuine empty (200).
    if (buckets.length === 0) return { summary: EMPTY_SUMMARY, periods: [] };
    return {
      summary: summariseCloudBuckets(buckets, new Date(toMs).toISOString()),
      periods: buildCloudHourlyPeriods(buckets, fromMs, toMs),
    };
  }

  const toMs = to ? new Date(to).getTime() : Date.now();
  const fromMs = from ? new Date(from).getTime() : toMs - 24 * 60 * 60 * 1000;
  const selfHostedSources = sources.filter((source) => source.kind === "self-hosted");
  let logSource: Awaited<ReturnType<typeof resolveTraefikLogSource>> | null = null;
  try {
    logSource = await resolveTraefikLogSource(project);
    const entries = await logSource.runtime.getRuntimeLogs(
      logSource.containerId,
      TRAEFIK_ANALYTICS_LOG_TAIL,
    );
    const requests = selfHostedSources.flatMap(({ domain }) =>
      entries
        .map((entry) => parseTraefikAccessLog(entry, domain))
        .filter((entry): entry is TraefikRequestLog => entry !== null),
    );
    return buildTraefikAnalyticsOverview(requests, fromMs, toMs);
  } catch (error) {
    throw new AppError(
      `Traefik analytics is unavailable: ${safeErrorMessage(error)}`,
      502,
      "ANALYTICS_UPSTREAM_UNAVAILABLE",
    );
  } finally {
    await logSource?.runtime.dispose?.();
  }
}

// ─── Deployment stats ────────────────────────────────────────────────────────

/**
 * Get deployment statistics for a project:
 *   - Total / success / failed counts
 *   - Average build duration
 *   - Daily deployments for the last 30 days
 */
export async function getDeploymentStats(
  ctx: RequestContext,
  projectId: string,
  days = 30,
): Promise<DeploymentStats> {
  const project = await repos.project.findById(projectId);
  if (!project || project.organizationId !== ctx.organizationId) {
    throw new NotFoundError("Project", projectId);
  }

  // Fetch all deployments for counting
  const { rows: deployments } = await repos.deployment.listByProject(projectId, {
    page: 1,
    perPage: 10_000, // Get all for stats
  });

  const total = deployments.length;
  const success = deployments.filter((d) => d.status === "ready").length;
  const failed = deployments.filter((d) => d.status === "failed").length;

  // Average build duration of successful deployments
  const successDeps = deployments.filter((d) => d.status === "ready" && d.buildDurationMs);
  const avgBuild =
    successDeps.length > 0
      ? Math.round(
          successDeps.reduce((sum, d) => sum + (d.buildDurationMs ?? 0), 0) / successDeps.length,
        )
      : 0;

  // Daily counts for the last N days
  const now = new Date();
  const dailyCounts: DeploymentStats["dailyCounts"] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0]!;

    const dayDeps = deployments.filter((d) => {
      const depDate = new Date(d.createdAt).toISOString().split("T")[0];
      return depDate === dateStr;
    });

    dailyCounts.push({
      date: dateStr,
      total: dayDeps.length,
      success: dayDeps.filter((d) => d.status === "ready").length,
      failed: dayDeps.filter((d) => d.status === "failed").length,
    });
  }

  return {
    totalDeployments: total,
    successfulDeployments: success,
    failedDeployments: failed,
    avgBuildDurationMs: avgBuild,
    dailyCounts,
  };
}

// ─── Resource usage (live) ───────────────────────────────────────────────────

/**
 * Get current resource usage for a project's active container.
 * Returns null if no active deployment.
 */
export async function getContainerUsage(
  ctx: RequestContext,
  projectId: string,
): Promise<ResourceUsage | null> {
  const project = await repos.project.findById(projectId);
  if (!project || project.organizationId !== ctx.organizationId) {
    throw new NotFoundError("Project", projectId);
  }

  if (!project.activeDeploymentId) return null;

  const dep = await repos.deployment.findById(project.activeDeploymentId);
  if (!dep?.containerId) return null;

  const { runtime } = await resolveDeploymentRuntime(dep);
  return runtime.getUsage(dep.containerId);
}

/**
 * Get container info (status, IP, uptime, current usage).
 */
export async function getContainerInfo(ctx: RequestContext, projectId: string) {
  const project = await repos.project.findById(projectId);
  if (!project || project.organizationId !== ctx.organizationId) {
    throw new NotFoundError("Project", projectId);
  }

  if (!project.activeDeploymentId) return null;

  const dep = await repos.deployment.findById(project.activeDeploymentId);
  if (!dep?.containerId) return null;

  const { runtime } = await resolveDeploymentRuntime(dep);
  return runtime.getContainerInfo(dep.containerId);
}

// ─── Dashboard home stats ────────────────────────────────────────────────────

/**
 * Get overview stats for the dashboard home — scoped to the caller's
 * current organization. Returns counts for projects + deployments in
 * the active org only (not cross-org).
 */
export async function getDashboardStats(ctx: RequestContext) {
  const [projectCounts, deploymentsByStatus] = await Promise.all([
    repos.project.countByOrganization(ctx.organizationId),
    repos.deployment.countByStatusForOrganization(ctx.organizationId),
  ]);

  let totalDeployments = 0;
  for (const count of Object.values(deploymentsByStatus)) totalDeployments += count;
  const successDeployments = deploymentsByStatus["ready"] ?? 0;
  const failedDeployments = deploymentsByStatus["failed"] ?? 0;

  return {
    projects: { total: projectCounts.total, active: projectCounts.active },
    deployments: {
      total: totalDeployments,
      success: successDeployments,
      failed: failedDeployments,
      pending: totalDeployments - successDeployments - failedDeployments,
    },
  };
}
