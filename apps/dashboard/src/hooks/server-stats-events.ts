import type { ServerStats } from "@/lib/api/system";

export type BatchedServerStatsEvent = { serverId: string; stats: ServerStats };

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
