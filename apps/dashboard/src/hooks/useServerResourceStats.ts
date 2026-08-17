"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";
import { endpoints } from "@/lib/api/endpoints";
import type { ServerStats } from "@/lib/api/system";
import { parseBatchedServerStatsEvent, stabilizeServerStats } from "./server-stats-events";

/** Streams whole-machine resource samples for every configured server. */
export function useServerResourceStats(serverIds: string[], intervalMs = 15_000) {
  const serverIdsKey = useMemo(() => [...serverIds].sort().join(","), [serverIds]);
  const stableServerIds = useMemo(
    () => (serverIdsKey ? serverIdsKey.split(",") : []),
    [serverIdsKey],
  );
  const [statsByServer, setStatsByServer] = useState<Record<string, ServerStats>>({});
  const [settledByServer, setSettledByServer] = useState<Record<string, true>>({});
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [generation, setGeneration] = useState(0);
  const controllersRef = useRef<AbortController[]>([]);
  const bootstrapSamplesRef = useRef<Record<string, ServerStats[]>>({});
  const [bootstrapCounts, setBootstrapCounts] = useState<Record<string, number>>({});

  const refresh = useCallback(() => {
    bootstrapSamplesRef.current = {};
    setBootstrapCounts({});
    setSettledByServer({});
    setGeneration((value) => value + 1);
  }, []);

  useEffect(() => {
    controllersRef.current.forEach((controller) => controller.abort());
    const activeIds = new Set(stableServerIds);
    setStatsByServer((current) =>
      Object.fromEntries(Object.entries(current).filter(([serverId]) => activeIds.has(serverId))),
    );
    setSettledByServer((current) =>
      Object.fromEntries(Object.entries(current).filter(([serverId]) => activeIds.has(serverId))),
    );
    if (stableServerIds.length === 0) {
      controllersRef.current = [];
      return;
    }

    // One multiplexed stream for the whole dashboard. Opening one permanent
    // same-origin HTTP/1.1 connection per server exhausted the browser's
    // connection pool at 5-6 servers, leaving Next.js RSC navigations queued
    // until a full reload closed the streams.
    let controller: AbortController | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (document.visibilityState !== "visible" || controller) return;
      controller = new AbortController();
      controllersRef.current = [controller];
      const activeController = controller;
      void (async () => {
      const params = new URLSearchParams({
        serverIds: stableServerIds.join(","),
        intervalMs: String(intervalMs),
      });
      try {
        const response = await fetch(
          `${getApiBaseUrl()}${endpoints.system.monitorStream}?${params.toString()}`,
          {
            credentials: "include",
            headers: { Accept: "text/event-stream" },
            signal: activeController.signal,
          },
        );
        if (!response.ok || !response.body) {
          setSettledByServer(Object.fromEntries(stableServerIds.map((id) => [id, true])));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!activeController.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const event of events) {
            if (event.includes("event: error")) {
              const data = event
                .split("\n")
                .find((line) => line.trimStart().startsWith("data:"))
                ?.trimStart()
                .slice(5)
                .trim();
              if (data) {
                try {
                  const parsed = JSON.parse(data) as { serverId?: unknown };
                  if (typeof parsed.serverId === "string") {
                    const failedServerId = parsed.serverId;
                    setSettledByServer((current) => ({ ...current, [failedServerId]: true }));
                  }
                } catch {
                  /* ignore malformed error payload */
                }
              }
              continue;
            }
            if (!event.includes("event: stats")) continue;
            const data = event
              .split("\n")
              .find((line) => line.trimStart().startsWith("data:"))
              ?.trimStart()
              .slice(5)
              .trim();
            if (!data) continue;
            const sample = parseBatchedServerStatsEvent(data);
            if (!sample) continue;
            const samples = [
              ...(bootstrapSamplesRef.current[sample.serverId] ?? []),
              sample.stats,
            ].slice(-3);
            bootstrapSamplesRef.current[sample.serverId] = samples;
            const stabilized = stabilizeServerStats(samples);
            if (!stabilized) continue;
            setStatsByServer((current) => ({ ...current, [sample.serverId]: stabilized }));
            setBootstrapCounts((current) => ({
              ...current,
              [sample.serverId]: Math.min(samples.length, 3),
            }));
            setSettledByServer((current) => ({ ...current, [sample.serverId]: true }));
            setUpdatedAt(Date.now());
          }
        }
      } catch {
        // Unavailable servers are excluded from the aggregate until refresh/reconnect.
        if (!activeController.signal.aborted) {
          setSettledByServer(Object.fromEntries(stableServerIds.map((id) => [id, true])));
        }
      } finally {
        if (controller === activeController) controller = null;
        if (!activeController.signal.aborted && document.visibilityState === "visible") {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, 1_000);
        }
      }
      })();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        connect();
      } else {
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        controller?.abort();
        controller = null;
        controllersRef.current = [];
      }
    };

    connect();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      controller?.abort();
    };
  }, [stableServerIds, generation, intervalMs]);

  return {
    statsByServer,
    updatedAt,
    // Preserve previously rendered values during a manual refresh. The card is
    // only blank on the true initial load, before any server has answered.
    loading:
      Object.keys(statsByServer).length === 0 &&
      stableServerIds.length > 0 &&
      Object.keys(settledByServer).length < stableServerIds.length,
    stabilizing: Object.values(bootstrapCounts).some((count) => count > 0 && count < 3),
    refresh,
  };
}
