"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";
import { endpoints } from "@/lib/api/endpoints";
import type { ServerStats } from "@/lib/api/system";

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

  const refresh = useCallback(() => {
    setStatsByServer({});
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
    const controllers = stableServerIds.map(() => new AbortController());
    controllersRef.current = controllers;

    stableServerIds.forEach((serverId, index) => {
      const controller = controllers[index];
      void (async () => {
        const params = new URLSearchParams({ serverId, intervalMs: String(intervalMs) });
        try {
          const response = await fetch(
            `${getApiBaseUrl()}${endpoints.system.monitorStream}?${params.toString()}`,
            {
              credentials: "include",
              headers: { Accept: "text/event-stream" },
              signal: controller.signal,
            },
          );
          if (!response.ok || !response.body) {
            setSettledByServer((current) => ({ ...current, [serverId]: true }));
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!controller.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";
            for (const event of events) {
              if (event.includes("event: error")) {
                setSettledByServer((current) => ({ ...current, [serverId]: true }));
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
              try {
                const stats = JSON.parse(data) as ServerStats;
                if (!Number.isFinite(stats.cpu) || !Number.isFinite(stats.memTotal)) continue;
                setStatsByServer((current) => ({ ...current, [serverId]: stats }));
                setSettledByServer((current) => ({ ...current, [serverId]: true }));
                setUpdatedAt(Date.now());
              } catch {
                // Ignore a malformed sample and keep the stream alive.
              }
            }
          }
        } catch {
          // An unavailable server is excluded from the aggregate until refresh/reconnect.
          if (!controller.signal.aborted) {
            setSettledByServer((current) => ({ ...current, [serverId]: true }));
          }
        }
      })();
    });

    return () => controllers.forEach((controller) => controller.abort());
  }, [stableServerIds, generation, intervalMs]);

  return {
    statsByServer,
    updatedAt,
    loading: stableServerIds.length > 0 && Object.keys(settledByServer).length < stableServerIds.length,
    refresh,
  };
}
