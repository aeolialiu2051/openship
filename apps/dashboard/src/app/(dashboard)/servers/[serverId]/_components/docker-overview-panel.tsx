"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Database, Loader2, RefreshCw } from "lucide-react";
import { getApiErrorMessage, systemApi } from "@/lib/api";
import type { DockerContainerOverview, DockerOverviewResponse } from "@/lib/api/system";
import { useI18n, interpolate } from "@/components/i18n-provider";

function metric(value: string | number | null, suffix = "") {
  return value == null ? "-" : `${value}${suffix}`;
}

function ContainerGauge({ value }: { value: number | null }) {
  const pct = Math.min(Math.max(value ?? 0, 0), 100);
  const tone =
    pct >= 90 ? "var(--danger-solid)" : pct >= 70 ? "var(--warning-solid)" : "var(--success-solid)";

  return (
    <div
      className="relative flex size-11 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(${tone} ${pct}%, var(--muted) ${pct}% 100%)`,
      }}
    >
      <div className="absolute inset-[4px] rounded-full bg-card" />
      <span className="relative text-[10px] font-medium leading-none tabular-nums text-muted-foreground">
        {value == null ? "-" : `${Math.round(value)}%`}
      </span>
    </div>
  );
}

function stateTone(container: DockerContainerOverview): string {
  if (container.health === "unhealthy") {
    return "border-danger-border bg-danger-bg text-danger";
  }
  if (container.health === "starting") {
    return "border-warning-border bg-warning-bg text-warning";
  }
  if (container.running) {
    return "border-success-border bg-success-bg text-success";
  }
  return "border-border bg-muted/60 text-muted-foreground";
}

function IoMetric({
  title,
  first,
  second,
  firstLabel,
  secondLabel,
}: {
  title: string;
  first: string | null;
  second: string | null;
  firstLabel: "up" | "read";
  secondLabel: "down" | "write";
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {title}
      </p>
      <div className="space-y-1 text-xs tabular-nums text-foreground">
        <div className="flex items-center gap-1.5">
          {firstLabel === "up" ? (
            <ArrowUp className="size-3 text-muted-foreground" />
          ) : (
            <span className="w-3 text-center text-[10px] text-muted-foreground">R</span>
          )}
          <span className="truncate">{metric(first)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {secondLabel === "down" ? (
            <ArrowDown className="size-3 text-muted-foreground" />
          ) : (
            <span className="w-3 text-center text-[10px] text-muted-foreground">W</span>
          )}
          <span className="truncate">{metric(second)}</span>
        </div>
      </div>
    </div>
  );
}

function ContainerRow({ container }: { container: DockerContainerOverview }) {
  return (
    <div className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1.5fr)_120px_130px_100px_100px] sm:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{container.name}</span>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${stateTone(container)}`}
          >
            {container.health ?? container.state}
          </span>
        </div>
        <p className="mt-1 truncate text-[11px] text-muted-foreground" title={container.image}>
          {container.image}
        </p>
        <p className="mt-1 truncate text-[11px] text-muted-foreground/70" title={container.status}>
          {container.status}
        </p>
      </div>

      <div className="flex h-full min-h-16 items-center gap-3 self-stretch">
        <ContainerGauge value={container.cpuPercent} />
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
            CPU
          </p>
          <p className="text-xs tabular-nums text-foreground">
            {metric(container.cpuPercent, "%")}
          </p>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
            MEM
          </p>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {metric(container.memoryPercent, "%")}
          </span>
        </div>
        <p className="mt-1 truncate text-xs tabular-nums text-foreground">
          {metric(container.memoryUsage)}
          {container.memoryLimit ? ` / ${container.memoryLimit}` : ""}
        </p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground/55 transition-[width] duration-500"
            style={{ width: `${Math.min(container.memoryPercent ?? 0, 100)}%` }}
          />
        </div>
      </div>

      <IoMetric
        title="NET I/O"
        first={container.networkTx}
        second={container.networkRx}
        firstLabel="up"
        secondLabel="down"
      />
      <IoMetric
        title="BLOCK I/O"
        first={container.blockRead}
        second={container.blockWrite}
        firstLabel="read"
        secondLabel="write"
      />
    </div>
  );
}

export function DockerOverviewPanel({ serverId }: { serverId: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<DockerOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);

  const load = useCallback(
    async (quiet = false) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (quiet) setRefreshing(true);
      else setLoading(true);

      try {
        const next = await systemApi.getDockerOverview(serverId);
        if (!alive.current) return;
        setData(next);
        setError(null);
      } catch (err) {
        if (!alive.current) return;
        setError(getApiErrorMessage(err, t.servers.overview.dockerLoadFailed));
      } finally {
        inFlight.current = false;
        if (alive.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [serverId, t],
  );

  useEffect(() => {
    alive.current = true;
    void load();
    const timer = window.setInterval(() => void load(true), 15_000);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
    };
  }, [load]);

  const running = data?.containers.filter((container) => container.running).length ?? 0;
  const total = data?.containers.length ?? 0;

  return (
    <div className="border-t border-border/40 bg-muted/15 px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <Database className="size-3.5 shrink-0" />
          {data && (
            <span className="tabular-nums">
              {interpolate(t.servers.overview.dockerSummary, {
                running: String(running),
                total: String(total),
              })}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading || refreshing}
          className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          aria-label={t.servers.security.refresh}
          title={t.servers.security.refresh}
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border/40 bg-card/70 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t.servers.overview.checking}
        </div>
      ) : error && !data ? (
        <div className="rounded-xl border border-danger-border bg-danger-bg px-4 py-4 text-sm text-danger">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-lg border border-danger-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-danger-bg/70"
          >
            {t.servers.banner.retry}
          </button>
        </div>
      ) : total === 0 ? (
        <div className="rounded-xl border border-border/40 bg-card/70 py-8 text-center text-sm text-muted-foreground">
          {t.servers.overview.dockerEmpty}
        </div>
      ) : (
        <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/50 bg-card/70">
          {data?.containers.map((container) => (
            <ContainerRow key={container.id || container.name} container={container} />
          ))}
        </div>
      )}

      {error && data && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
