"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Database, Loader2, RefreshCw } from "lucide-react";
import { getApiErrorMessage, systemApi } from "@/lib/api";
import type { DockerContainerOverview, DockerOverviewResponse } from "@/lib/api/system";
import { useI18n, interpolate } from "@/components/i18n-provider";
import { groupDockerContainers, type DockerContainerGroup } from "./docker-overview-view";

function metric(value: string | number | null, suffix = "") {
  return value == null ? "-" : `${value}${suffix}`;
}

function ContainerGauge({ value }: { value: number | null }) {
  const pct = Math.min(Math.max(value ?? 0, 0), 100);

  return (
    <div
      className="relative flex size-9 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(rgb(139 92 246) 0%, rgb(34 211 238) ${pct}%, var(--muted) ${pct}% 100%)`,
      }}
    >
      <div className="absolute inset-[3px] rounded-full bg-card" />
      <span className="relative text-[9px] font-medium leading-none tabular-nums text-muted-foreground">
        {value == null ? "-" : `${Math.round(value)}%`}
      </span>
    </div>
  );
}

function stateTone(container: DockerContainerOverview): string {
  if (container.health === "unhealthy") {
    return "text-danger";
  }
  if (container.health === "starting") {
    return "text-warning";
  }
  if (container.running) {
    return "text-success";
  }
  return "text-muted-foreground";
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

function ContainerCard({ container }: { container: DockerContainerOverview }) {
  return (
    <article className="docker-overview-card min-w-0 rounded-2xl border border-border/50 bg-card/75 px-4 py-4 transition-colors hover:border-border">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
            container.running ? "border-success/45" : "border-border"
          }`}
          aria-hidden="true"
        >
          <span
            className={`size-1.5 rounded-full ${
              container.running ? "bg-success-solid" : "bg-muted-foreground/50"
            }`}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <span className="truncate text-sm font-medium text-foreground">{container.name}</span>
            <span
              className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${stateTone(container)}`}
            >
              {container.health ?? container.state}
            </span>
          </div>
          <p className="mt-1 truncate text-[11px] text-muted-foreground" title={container.image}>
            {container.image}
          </p>
          <p
            className="mt-1 truncate text-[11px] text-muted-foreground/70"
            title={container.status}
          >
            {container.status}
          </p>
        </div>
      </div>

      <div className="docker-overview-metrics mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border/40 pt-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex shrink-0 flex-col items-center">
            <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">
              CPU
            </p>
            <div className="mt-1.5">
              <ContainerGauge value={container.cpuPercent} />
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">
              MEM
            </p>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {metric(container.memoryPercent, "%")}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] tabular-nums text-foreground/80">
            {metric(container.memoryUsage)}
            {container.memoryLimit ? ` / ${container.memoryLimit}` : ""}
          </p>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-foreground/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-[width] duration-500"
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
    </article>
  );
}

function ContainerGroup({
  group,
  standaloneLabel,
  projectLabel,
}: {
  group: DockerContainerGroup;
  standaloneLabel: string;
  projectLabel: string;
}) {
  const name = group.kind === "standalone" ? standaloneLabel : group.name;
  const type =
    group.kind === "standalone"
      ? null
      : group.kind === "compose" || !group.isApp
        ? "Compose"
        : projectLabel;

  return (
    <section className="docker-overview-group">
      <div className="mb-3 flex min-w-0 items-baseline gap-2 px-0.5">
        <h3 className="truncate text-sm font-semibold text-foreground">{name}</h3>
        <span className="shrink-0 text-xs text-muted-foreground">
          {type ? `${type} · ` : "· "}
          <span className="tabular-nums">{group.containers.length}</span>
        </span>
      </div>
      <div className="docker-overview-card-grid grid grid-cols-1 gap-3">
        {group.containers.map((container) => (
          <ContainerCard key={container.id || container.name} container={container} />
        ))}
      </div>
    </section>
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
        const message = getApiErrorMessage(err, t.servers.overview.dockerLoadFailed);
        setError(
          /signal is aborted|aborterror/i.test(message)
            ? t.servers.overview.dockerLoadFailed
            : message,
        );
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
    const poll = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const timer = window.setInterval(poll, 15_000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load]);

  const running = data?.containers.filter((container) => container.running).length ?? 0;
  const total = data?.containers.length ?? 0;
  const groups = data ? groupDockerContainers(data) : [];

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
        <div className="space-y-5">
          {groups.map((group) => (
            <ContainerGroup
              key={group.key}
              group={group}
              standaloneLabel={t.servers.overview.dockerStandalone}
              projectLabel={t.servers.overview.dockerProject}
            />
          ))}
        </div>
      )}

      {error && data && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
