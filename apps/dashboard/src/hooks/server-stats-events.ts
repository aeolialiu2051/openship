import type { ServerStats } from "@/lib/api/system";

export type BatchedServerStatsEvent = { serverId: string; stats: ServerStats };

/**
 * Keep the first reading responsive, then reject a one-off CPU spike once the
 * three-sample bootstrap window is complete. Other counters stay live from the
 * newest sample because only CPU is based on a very short point-in-time probe.
 */
export function stabilizeServerStats(samples: ServerStats[]): ServerStats | null {
  const latest = samples.at(-1);
  if (!latest) return null;
  if (samples.length < 3) return latest;

  const cpu = samples
    .slice(-3)
    .map((sample) => sample.cpu)
    .sort((a, b) => a - b)[1];
  return { ...latest, cpu };
}

export function parseBatchedServerStatsEvent(raw: string): BatchedServerStatsEvent | null {
  try {
    const event = JSON.parse(raw) as Partial<BatchedServerStatsEvent>;
    if (!event || typeof event.serverId !== "string" || !event.serverId || !event.stats) return null;
    if (!Number.isFinite(event.stats.cpu) || !Number.isFinite(event.stats.memTotal)) return null;
    return { serverId: event.serverId, stats: event.stats };
  } catch {
    return null;
  }
}
