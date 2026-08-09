const PS_MARKER = "__VIBRAIL_DOCKER_PS__";
const STATS_MARKER = "__VIBRAIL_DOCKER_STATS__";

export const DOCKER_OVERVIEW_COMMAND = [
  `printf '${PS_MARKER}\\n'`,
  "docker ps -a --no-trunc --format '{{json .}}'",
  `printf '${STATS_MARKER}\\n'`,
  "docker stats --all --no-stream --format '{{json .}}'",
].join("; ");

export type DockerHealth = "healthy" | "unhealthy" | "starting" | null;

export interface DockerContainerOverview {
  id: string;
  name: string;
  image: string;
  /** Vibrail ownership labels, when this is a managed workload. */
  projectId: string | null;
  deploymentId: string | null;
  serviceName: string | null;
  buildId: string | null;
  /** Native Docker Compose identity, including non-Vibrail stacks. */
  composeProject: string | null;
  composeService: string | null;
  state: string;
  status: string;
  health: DockerHealth;
  running: boolean;
  cpuPercent: number | null;
  memoryUsage: string | null;
  memoryLimit: string | null;
  memoryPercent: number | null;
  networkRx: string | null;
  networkTx: string | null;
  blockRead: string | null;
  blockWrite: string | null;
  pids: number | null;
}

interface DockerPsRow {
  ID?: string;
  Image?: string;
  Names?: string;
  Labels?: string;
  State?: string;
  Status?: string;
}

interface DockerStatsRow {
  Container?: string;
  ID?: string;
  Name?: string;
  CPUPerc?: string;
  MemUsage?: string;
  MemPerc?: string;
  NetIO?: string;
  BlockIO?: string;
  PIDs?: string;
}

function parseJsonLines<T>(section: string): T[] {
  const rows: T[] = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      rows.push(JSON.parse(trimmed) as T);
    } catch {
      // Docker can interleave a warning with stdout. A malformed line should
      // not hide the other containers that were returned successfully.
    }
  }
  return rows;
}

function parsePercent(value?: string): number | null {
  if (!value || value === "--") return null;
  const parsed = Number.parseFloat(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value?: string): number | null {
  if (!value || value === "--") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitPair(value?: string): [string | null, string | null] {
  if (!value || value === "--") return [null, null];
  const [left, right] = value.split(" / ");
  return [left?.trim() || null, right?.trim() || null];
}

function normalizeName(value?: string): string {
  return (value ?? "").replace(/^\//, "").trim();
}

// Project ids are generated with nanoid's URL-safe alphabet. Besides letters
// and digits, valid production ids can therefore contain `_` and `-` (for
// example `proj_j_FHHc7x1DNo5q7I`). Reject path/control punctuation, but do
// not discard those canonical ids or their containers cannot be attributed.
const VIBRAIL_PROJECT_ID_RE = /^proj_[A-Za-z0-9_-]+$/;

/**
 * `docker ps --format '{{json .}}'` emits labels as a comma-delimited string.
 * Vibrail's identity labels never contain commas, so only parse the small,
 * known allowlist we use for workload correlation. Unknown/user labels are not
 * returned by this endpoint.
 */
function labelValue(raw: string | undefined, key: string): string | null {
  if (!raw) return null;
  const prefix = `${key}=`;
  for (const entry of raw.split(",")) {
    if (entry.startsWith(prefix)) return entry.slice(prefix.length) || null;
  }
  return null;
}

function healthFromStatus(status: string): DockerHealth {
  if (/\(healthy\)/i.test(status)) return "healthy";
  if (/\(unhealthy\)/i.test(status)) return "unhealthy";
  if (/\(health:\s*starting\)/i.test(status)) return "starting";
  return null;
}

/** Parse the two JSON-lines sections emitted by `DOCKER_OVERVIEW_COMMAND`. */
export function parseDockerOverview(raw: string): DockerContainerOverview[] {
  const psStart = raw.indexOf(PS_MARKER);
  const statsStart = raw.indexOf(STATS_MARKER);
  const psSection =
    psStart >= 0
      ? raw.slice(psStart + PS_MARKER.length, statsStart >= 0 ? statsStart : undefined)
      : "";
  const statsSection = statsStart >= 0 ? raw.slice(statsStart + STATS_MARKER.length) : "";

  const psRows = parseJsonLines<DockerPsRow>(psSection);
  const statsRows = parseJsonLines<DockerStatsRow>(statsSection);
  const statsByName = new Map<string, DockerStatsRow>();
  const statsById = new Map<string, DockerStatsRow>();

  for (const row of statsRows) {
    const name = normalizeName(row.Name);
    const id = row.Container ?? row.ID ?? "";
    if (name) statsByName.set(name, row);
    if (id) statsById.set(id, row);
  }

  return psRows
    .map((row): DockerContainerOverview => {
      const id = row.ID ?? "";
      const name = normalizeName(row.Names) || id.slice(0, 12) || "unknown";
      const stats = statsByName.get(name) ?? statsById.get(id) ?? statsById.get(id.slice(0, 12));
      const [memoryUsage, memoryLimit] = splitPair(stats?.MemUsage);
      const [networkRx, networkTx] = splitPair(stats?.NetIO);
      const [blockRead, blockWrite] = splitPair(stats?.BlockIO);
      const state = (row.State ?? "unknown").toLowerCase();
      const status = row.Status ?? state;
      const labelledProjectId = labelValue(row.Labels, "vibrail.project");
      // Container labels are attacker-controlled input. Only retain the
      // canonical project-id shape before the API uses it in a DB lookup.
      const projectId =
        labelledProjectId && VIBRAIL_PROJECT_ID_RE.test(labelledProjectId)
          ? labelledProjectId
          : null;

      return {
        id,
        name,
        image: row.Image ?? "-",
        projectId,
        deploymentId: labelValue(row.Labels, "vibrail.deployment"),
        serviceName: labelValue(row.Labels, "vibrail.service"),
        buildId: labelValue(row.Labels, "vibrail.build"),
        composeProject: labelValue(row.Labels, "com.docker.compose.project"),
        composeService: labelValue(row.Labels, "com.docker.compose.service"),
        state,
        status,
        health: healthFromStatus(status),
        running: state === "running",
        cpuPercent: parsePercent(stats?.CPUPerc),
        memoryUsage,
        memoryLimit,
        memoryPercent: parsePercent(stats?.MemPerc),
        networkRx,
        networkTx,
        blockRead,
        blockWrite,
        pids: parseInteger(stats?.PIDs),
      };
    })
    .sort((a, b) => Number(b.running) - Number(a.running) || a.name.localeCompare(b.name));
}
