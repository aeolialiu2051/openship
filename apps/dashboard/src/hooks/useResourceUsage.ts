"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { systemApi } from "@/lib/api";
import type { Project } from "@/constants/mock";
import { getProjectStatus } from "@/utils/project-status";

/** Aggregated live resource usage for one project (sum over its running containers). */
export interface ProjectUsage {
  cpuPercent: number | null;
  memoryUsedMiB: number | null;
  memoryLimitMiB: number | null;
  memoryPercent: number | null;
  uptimeSeconds: number | null;
}

const POLL_INTERVAL_MS = 15_000;

/** Parse docker-style memory strings ("81.14MiB", "1.2GiB") into MiB. */
export function parseMemoryToMiB(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^([\d.]+)\s*(B|KiB|MiB|GiB|TiB|kB|KB|MB|GB|TB)?$/i);
  if (!match) return null;
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) return null;
  switch ((match[2] ?? "MiB").toLowerCase()) {
    case "b":
      return amount / (1024 * 1024);
    case "kib":
    case "kb":
      return amount / 1024;
    case "mib":
    case "mb":
      return amount;
    case "gib":
    case "gb":
      return amount * 1024;
    case "tib":
    case "tb":
      return amount * 1024 * 1024;
    default:
      return amount;
  }
}

export function formatMiB(mib: number | null | undefined): string {
  if (mib == null) return "—";
  if (mib >= 1024) return `${(mib / 1024).toFixed(2)}GiB`;
  return `${mib.toFixed(2)}MiB`;
}

/**
 * Live CPU/MEM usage for the given projects, keyed by project id.
 *
 * The projects/home payload only carries static resource *config*, so real
 * usage is collected per server via the docker overview endpoint (one call
 * per distinct server that hosts a live project). Polls quietly every 15s;
 * call `refresh()` for an immediate reload (e.g. the home refresh button).
 *
 * Coverage notes:
 * - Deployment meta only keeps `serverId` for `deployTarget === "server"`.
 *   Local deploys run on the host docker daemon but carry no serverId, so
 *   those projects are attributed to the auto-registered isLocal
 *   "This Server" row (self-hosted installs) when one exists.
 * - Cloud-hosted projects run on Vibrail Cloud infrastructure that no user
 *   server can inspect — they get no entry and render "—".
 */
export function useResourceUsage(projects: Project[], pollIntervalMs: number | null = POLL_INTERVAL_MS) {
  const [usageByProject, setUsageByProject] = useState<Record<string, ProjectUsage>>({});
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [localServerId, setLocalServerId] = useState<string | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);

  // Resolve the auto-registered isLocal "This Server" row once — the stats
  // endpoint is server-scoped, and local deploys can only be measured
  // through it.
  useEffect(() => {
    let cancelled = false;
    systemApi
      .listServers()
      .then((servers) => {
        if (cancelled) return;
        setLocalServerId(servers.find((server) => server.isLocal)?.id ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Distinct servers hosting at least one live project — only those have
  // containers worth measuring. Live projects without a serverId (local
  // deploys) pull in the isLocal server. Serialized to a stable dep key.
  const serverIdsKey = useMemo(() => {
    const ids = new Set<string>();
    let needsLocal = false;
    for (const project of projects) {
      if (getProjectStatus(project) !== "live") continue;
      if (project.serverId) {
        ids.add(project.serverId);
      } else if (project.deployTarget !== "cloud") {
        needsLocal = true;
      }
    }
    if (needsLocal && localServerId) ids.add(localServerId);
    return [...ids].sort().join(",");
  }, [projects, localServerId]);
  const serverIds = useMemo(
    () => (serverIdsKey ? serverIdsKey.split(",") : []),
    [serverIdsKey],
  );

  const load = useCallback(async (showLoading = false) => {
    if (inFlight.current) return;
    if (showLoading) setLoaded(false);

    if (serverIds.length === 0) {
      setUsageByProject({});
      setLoaded(true);
      return;
    }
    inFlight.current = true;
    try {
      const results = await Promise.allSettled(
        serverIds.map((id) => systemApi.getDockerOverview(id)),
      );
      if (!alive.current) return;

      const next: Record<string, ProjectUsage> = {};
      let anyFulfilled = false;
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        anyFulfilled = true;
        for (const projectGroup of result.value.projects) {
          const running = projectGroup.containers.filter((container) => container.running);
          if (running.length === 0) continue;

          let cpu = 0;
          let hasCpu = false;
          let usedMiB = 0;
          let limitMiB = 0;
          let hasMem = false;
          let uptimeSeconds: number | null = null;
          for (const container of running) {
            if (container.cpuPercent != null) {
              cpu += container.cpuPercent;
              hasCpu = true;
            }
            const used = parseMemoryToMiB(container.memoryUsage);
            const limit = parseMemoryToMiB(container.memoryLimit);
            if (used != null) {
              usedMiB += used;
              hasMem = true;
            }
            if (limit != null) limitMiB += limit;
            if (container.uptimeSeconds != null) {
              // A multi-container project is fully up only as long as its
              // newest running container, matching the detail view's runtime.
              uptimeSeconds = uptimeSeconds == null
                ? container.uptimeSeconds
                : Math.min(uptimeSeconds, container.uptimeSeconds);
            }
          }

          next[projectGroup.id] = {
            cpuPercent: hasCpu ? cpu : null,
            memoryUsedMiB: hasMem ? usedMiB : null,
            memoryLimitMiB: limitMiB > 0 ? limitMiB : null,
            memoryPercent: hasMem && limitMiB > 0 ? (usedMiB / limitMiB) * 100 : null,
            uptimeSeconds,
          };
        }
      }
      setUsageByProject(next);
      if (anyFulfilled) setUpdatedAt(Date.now());
    } finally {
      inFlight.current = false;
      if (alive.current) setLoaded(true);
    }
  }, [serverIds]);

  useEffect(() => {
    alive.current = true;
    setLoaded(false);
    void load();
    const timer = pollIntervalMs == null
      ? null
      : window.setInterval(() => void load(), pollIntervalMs);
    return () => {
      alive.current = false;
      if (timer != null) window.clearInterval(timer);
    };
  }, [load, pollIntervalMs]);

  return { usageByProject, updatedAt, loaded, refresh: load };
}
