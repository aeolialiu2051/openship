"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AppWindow,
  ArrowRight,
  BookOpen,
  Boxes,
  Check,
  CheckCircle2,
  Clock3,
  Cloud,
  ExternalLink,
  FolderKanban,
  GitBranch,
  Gauge,
  HardDrive,
  MemoryStick,
  Loader2,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Rocket,
  ScrollText,
  Search,
  Server,
  Settings,
  Terminal,
  X,
} from "lucide-react";

import { AppLogo } from "@/components/AppLogo";
import { getFrameworkConfig } from "@/components/import-project/Frameworks";
import { useI18n, interpolate } from "@/components/i18n-provider";
import UpdatesBlock from "@/components/overview/UpdatesBlock";
import HomeWelcome from "@/components/overview/HomeWelcome";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { type Project } from "@/constants/mock";
import { useDashboardHome } from "@/hooks/useDashboardHome";
import { getProjectsHomeFetchedAt } from "@/hooks/useProjectsHome";
import { formatMiB, useResourceUsage, type ProjectUsage } from "@/hooks/useResourceUsage";
import { useServerResourceStats } from "@/hooks/useServerResourceStats";
import { useServersList } from "@/hooks/useServersList";
import { projectsApi, systemApi } from "@/lib/api";
import { getProjectStatus, PROJECT_STATUS_META, projectStatusLabel } from "@/utils/project-status";
import { isStaticProjectRuntime } from "@/utils/project-runtime";
import { FEATURED_APPS } from "./apps/featured-apps";

type ResourceFilter = "all" | "projects"| "apps"  | "running" | "stopped";
const HOME_REFRESH_INTERVAL_MS = 15_000;

interface DashboardHomeClientProps {
  initialData?: unknown;
}

const QUICK_LINKS = [
  { href: "/library", icon: GitBranch, key: "importGit", description: "importGitDesc" },
  { href: "/settings?tab=mcp", icon: Boxes, key: "mcpDeploy", description: "mcpDeployDesc" },
  { href: "/settings", icon: Settings, key: "settingsCard", description: "settingsCardDesc" },
] as const;

function formatDateTimeParts(date: string | number | undefined | null, locale: string) {
  if (date == null || date === "") return null;
  const value = new Date(date);
  if (!Number.isFinite(value.getTime())) return null;
  const datePart = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
  const timePart = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(value);
  return { datePart, timePart };
}

function formatRuntime(
  startedAt: string | null | undefined,
  running: boolean,
  locale: string,
  uptimeSeconds?: number | null,
) {
  if (!running) return "—";
  let totalMinutes: number;
  if (uptimeSeconds != null) {
    totalMinutes = Math.max(0, Math.floor(uptimeSeconds / 60));
  } else {
    if (!startedAt) return "—";
    const started = new Date(startedAt).getTime();
    if (!Number.isFinite(started)) return "—";
    totalMinutes = Math.max(0, Math.floor((Date.now() - started) / 60_000));
  }
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  const formatUnit = (value: number, unit: "day" | "hour" | "minute") =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit,
      unitDisplay: "narrow",
    }).format(value);
  if (days > 0) return `${formatUnit(days, "day")} ${formatUnit(hours, "hour")}`;
  if (hours > 0) return `${formatUnit(hours, "hour")} ${formatUnit(minutes, "minute")}`;
  return formatUnit(minutes, "minute");
}

function locationLabel(project: Project, labels: Copy) {
  if (project.serverName) return project.serverName;
  if (project.deployTarget === "cloud") return "Vibrail Cloud";
  if (project.deployTarget === "server") return labels.server;
  if (project.deployTarget === "local") return labels.local;
  return "—";
}

function projectDomainUrl(domain: string | null | undefined) {
  const value = domain?.trim();
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function LocationIcon({ project }: { project: Project }) {
  if (project.deployTarget === "cloud") return <Cloud className="size-3.5" />;
  if (project.deployTarget === "local") return <HardDrive className="size-3.5" />;
  return <Server className="size-3.5" />;
}

function ResourceIcon({ project }: { project: Project }) {
  const [faviconFailed, setFaviconFailed] = useState(false);
  // Installed catalog apps have a stable, curated brand identity. Their
  // deployed site's favicon may be generic, stale, or customized (Excalidraw
  // currently serves a different purple favicon), so never let it override
  // the catalog logo. Site favicons remain the right first choice for regular
  // user projects.
  if (project.isApp && project.appTemplateId) {
    return <AppLogo appId={project.appTemplateId} className="size-5" />;
  }
  if (project.favicon && !faviconFailed) {
    return (
      <img
        src={project.favicon}
        alt=""
        className="size-5 object-contain"
        onError={() => setFaviconFailed(true)}
      />
    );
  }
  return <div className="size-5">{getFrameworkConfig(project.framework).icon("currentColor")}</div>;
}

/** Circular CPU gauge — conic-gradient ring with the percentage inside,
 * same visual language as the server docker overview panel. */
function CpuGauge({ value }: { value: number | null }) {
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
        {value == null ? "—" : `${Math.round(value)}%`}
      </span>
    </div>
  );
}

/** Live usage cell: CPU ring gauge + MEM used/limit with a progress bar.
 * Renders "—" for stopped/cloud projects and a pulse while the first
 * metrics poll is still in flight. */
function UsageCell({
  live,
  usage,
  loaded,
  unavailableReason,
}: {
  live: boolean;
  usage: ProjectUsage | undefined;
  loaded: boolean;
  unavailableReason: string;
}) {
  if (!live) {
    return <span className="text-xs leading-relaxed text-muted-foreground/60">{unavailableReason}</span>;
  }
  if (!loaded) {
    return (
      <div className="flex items-center gap-3" aria-busy="true">
        <div className="size-9 animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
          <div className="h-1 w-full animate-pulse rounded-full bg-muted" />
        </div>
      </div>
    );
  }
  if (!usage) {
    return <span className="text-xs leading-relaxed text-muted-foreground/60">{unavailableReason}</span>;
  }
  const memPct = Math.min(Math.max(usage.memoryPercent ?? 0, 0), 100);
  return (
    <div className="flex items-start gap-3">
      <div className="flex shrink-0 flex-col items-center">
        <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">
          CPU
        </span>
        <div className="mt-1.5">
          <CpuGauge value={usage.cpuPercent} />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">MEM</span>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {usage.memoryPercent == null ? "—" : `${usage.memoryPercent.toFixed(2)}%`}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] tabular-nums text-foreground/80">
          {formatMiB(usage.memoryUsedMiB)} / {formatMiB(usage.memoryLimitMiB)}
        </p>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-foreground/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-[width] duration-500"
            style={{ width: `${memPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

type Copy = ReturnType<typeof getCopy>;

function getCopy(locale: string) {
  const zh = locale === "zh";
  return zh
    ? {
        search: "搜索项目、应用或命令…",
        refresh: "刷新",
        refreshed: "已更新",
        refreshSuccess: "数据已刷新",
        refreshFailed: "刷新失败，请稍后重试",
        totalResources: "全部服务",
        serverConnections: "服务器连接",
        connected: "在线",
        disconnected: "离线",
        deployments: "部署总数",
        successRate: "部署成功率",
        totalCpu: "总 CPU",
        totalMemory: "总内存",
        measuredServers: "已统计 {measured} / {total} 台服务器",
        latestUpdate: "数据刷新时间",
        resourceOverview: "资源总览",
        all: "全部",
        apps: "应用",
        projects: "项目",
        running: "运行中",
        stopped: "未运行",
        name: "名称",
        type: "类型",
        visibility: "访问权限",
        public: "公开",
        private: "私有",
        stack: "技术栈",
        location: "运行位置",
        resources: "资源用量 (CPU / MEM)",
        updated: "运行时长",
        status: "状态",
        actions: "操作",
        noResults: "没有找到匹配的资源",
        viewAllProjects: "查看全部项目",
        viewAllApps: "查看全部应用",
        server: "自托管服务器",
        local: "本地",
        unconfigured: "未配置",
        usageStopped: "已停止",
        usageCloud: "云端暂无",
        usageStatic: "静态站点",
        usageUnavailable: "资源指标暂不可用",
        usageUnmatched: "无容器",
        terminal: "打开服务器终端",
        logs: "打开项目日志",
        openProject: "打开项目域名",
        stop: "停止服务",
        start: "启动服务",
        stopTitle: "停止服务？",
        stopDescription: "停止后，{name} 将暂时无法访问。之后可随时从此处重新启动。",
        cancel: "取消",
        confirmStop: "确认停止",
        stopping: "正在停止…",
        stopSuccess: "服务已停止",
        startSuccess: "服务已启动",
        actionFailed: "操作失败，请稍后重试",
      }
    : {
        search: "Search projects, apps, or commands…",
        refresh: "Refresh",
        refreshed: "Updated",
        refreshSuccess: "Data refreshed",
        refreshFailed: "Refresh failed, please try again",
        totalResources: "Total services",
        serverConnections: "Server connections",
        connected: "Online",
        disconnected: "Offline",
        deployments: "Total deployments",
        successRate: "Deployment success",
        totalCpu: "Total CPU",
        totalMemory: "Total memory",
        measuredServers: "{measured} / {total} servers measured",
        latestUpdate: "Last refreshed",
        resourceOverview: "Resource overview",
        all: "All",
        apps: "Apps",
        projects: "Projects",
        running: "Running",
        stopped: "Not running",
        name: "Name",
        type: "Type",
        visibility: "Visibility",
        public: "Public",
        private: "Private",
        stack: "Stack",
        location: "Location",
        resources: "Usage (CPU / MEM)",
        updated: "Runtime",
        status: "Status",
        actions: "Actions",
        noResults: "No matching resources",
        viewAllProjects: "View all projects",
        viewAllApps: "View all apps",
        server: "Self-hosted server",
        local: "Local",
        unconfigured: "Not configured",
        usageStopped: "Stopped",
        usageCloud: "Cloud unavailable",
        usageStatic: "Static site",
        usageUnavailable: "Metrics unavailable",
        usageUnmatched: "No container",
        terminal: "Open server terminal",
        logs: "Open project logs",
        openProject: "Open project domain",
        stop: "Stop service",
        start: "Start service",
        stopTitle: "Stop service?",
        stopDescription: "Stopping {name} will make it temporarily unavailable. You can start it again here at any time.",
        cancel: "Cancel",
        confirmStop: "Stop service",
        stopping: "Stopping…",
        stopSuccess: "Service stopped",
        startSuccess: "Service started",
        actionFailed: "Action failed, please try again",
      };
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
  loading,
  valueClassName,
  chart,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  detail?: string;
  tone: "green" | "cyan" | "violet" | "neutral";
  loading: boolean;
  valueClassName?: string;
  chart?: { values: number[]; color: string };
}) {
  const tones = {
    green: "bg-emerald-500/10 text-emerald-400",
    cyan: "bg-cyan-500/10 text-cyan-400",
    violet: "bg-violet-500/10 text-violet-400",
    neutral: "bg-foreground/[0.06] text-foreground/70",
  };
  return (
    <div className="group min-h-[132px] rounded-2xl border border-border/50 bg-card p-4 transition-colors hover:border-border">
      <div className="flex items-start gap-3">
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 pt-0.5">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          {loading ? (
            <div className="mt-2 h-7 w-16 animate-pulse rounded-md bg-muted" />
          ) : (
            <p className={`mt-1 font-medium leading-none tracking-tight text-foreground ${valueClassName ?? "text-[26px]"}`}>{value}</p>
          )}
          {detail && (loading ? (
            <div className="mt-2 h-3 w-28 animate-pulse rounded bg-muted/70" />
          ) : (
            <p className="mt-2 truncate text-xs text-muted-foreground/70">{detail}</p>
          ))}
        </div>
      </div>
      {loading && chart ? (
        <div className="mt-2 h-7 w-full animate-pulse rounded-md bg-muted/60" />
      ) : chart ? (
        <Sparkline values={chart.values} color={chart.color} />
      ) : (
        <div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-border to-transparent opacity-70" />
      )}
    </div>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const points = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1);
  const path = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 25 - ((value - min) / range) * 18;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className="mt-2 h-7 w-full overflow-visible" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={path}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function DashboardHomeClient({ initialData }: DashboardHomeClientProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { t, locale } = useI18n();
  const { projects, numbers, loading, refresh } = useDashboardHome(initialData);
  const { data: serversData, isLoading: serversLoading, refresh: refreshServers } = useServersList();
  const servers = useMemo(() => serversData ?? [], [serversData]);
  // The home page owns one coordinated refresh clock below. Disable the hook's
  // independent timer so usage, projects and servers cannot drift into
  // duplicate 15-second request waves.
  const {
    usageByProject,
    failedServerIds,
    updatedAt: usageUpdatedAt,
    loaded: usageLoaded,
    refresh: refreshUsage,
  } = useResourceUsage(projects, null);
  const serverIds = useMemo(() => servers.map((server) => server.id), [servers]);
  const {
    statsByServer,
    updatedAt: serverStatsUpdatedAt,
    loading: serverStatsLoading,
    refresh: refreshServerStats,
  } = useServerResourceStats(serverIds, HOME_REFRESH_INTERVAL_MS);
  const labels = useMemo(() => getCopy(locale), [locale]);
  const searchRef = useRef<HTMLInputElement>(null);
  const [localHour, setLocalHour] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ResourceFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);
  const [projectsFetchedAt, setProjectsFetchedAt] = useState<number | null>(null);
  const [serverReachability, setServerReachability] = useState<Record<string, boolean>>({});
  const [serverReachabilityLoaded, setServerReachabilityLoaded] = useState(false);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memoryHistory, setMemoryHistory] = useState<number[]>([]);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [stopTarget, setStopTarget] = useState<Project | null>(null);
  const [actionProjectId, setActionProjectId] = useState<string | null>(null);
  const refreshDoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshSourcesRef = useRef({ refresh, refreshUsage, refreshServers });
  refreshSourcesRef.current = { refresh, refreshUsage, refreshServers };

  // Mirror the shared cache's last-fetch timestamp into local state whenever
  // the data changes (initial load, background revalidation, manual refresh).
  useEffect(() => {
    const fetchedAt = getProjectsHomeFetchedAt();
    if (fetchedAt) setProjectsFetchedAt(fetchedAt);
  }, [projects, numbers]);

  useEffect(() => setLocalHour(new Date().getHours()), []);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);
  useEffect(
    () => () => {
      if (refreshDoneTimer.current) clearTimeout(refreshDoneTimer.current);
    },
    [],
  );

  useEffect(() => {
    let visibilityRefreshTimer: number | null = null;
    const refreshVisibleData = () => {
      if (document.visibilityState !== "visible") return;
      const sources = refreshSourcesRef.current;
      void Promise.allSettled([
        sources.refresh(),
        sources.refreshUsage(),
        sources.refreshServers(),
      ]).then(() => setDataRefreshKey((key) => key + 1));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      // Prioritize the user's first navigation after resuming the tab. An
      // immediate refresh starts several API requests while the browser is
      // still recovering its connection pool and can stall the RSC request
      // initiated by the user's click.
      visibilityRefreshTimer = window.setTimeout(refreshVisibleData, 3_000);
    };
    const timer = window.setInterval(refreshVisibleData, HOME_REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      if (visibilityRefreshTimer != null) window.clearTimeout(visibilityRefreshTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (serversData === undefined) {
      setServerReachability({});
      return;
    }
    if (servers.length === 0) {
      setServerReachability({});
      setServerReachabilityLoaded(true);
      return;
    }
    void Promise.all(
      servers.map(async (server) => {
        try {
          const result = await systemApi.probeReachability(server.id);
          return [server.id, result.reachable] as const;
        } catch {
          return [server.id, false] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setServerReachability(Object.fromEntries(entries));
      setServerReachabilityLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [servers, serversData]);

  const greeting =
    localHour == null
      ? ""
      : localHour < 12
        ? t.dashboard.home.goodMorning
        : localHour < 18
          ? t.dashboard.home.goodAfternoon
          : t.dashboard.home.goodEvening;
  const displayName = user?.name?.split(" ")[0] || "";
  const liveProjects = projects.filter((project) => getProjectStatus(project) === "live");
  const connectedServers = servers.filter((server) => serverReachability[server.id]).length;
  const disconnectedServers = servers.length - connectedServers;
  const appCount = projects.filter((project) => project.isApp).length;
  const projectCount = projects.length - appCount;
  const deploymentCount = numbers.total_deployments ?? 0;
  const successRate = deploymentCount
    ? Math.round(((numbers.total_success_deployments ?? 0) / deploymentCount) * 100)
    : 0;
  const serverStats = Object.values(statsByServer);
  const serverTotals = serverStats.reduce(
    (total, stats) => {
      const cores = Number.isFinite(stats.cpuCores) && stats.cpuCores > 0 ? stats.cpuCores : 1;
      return {
        weightedCpu: total.weightedCpu + stats.cpu * cores,
        cpuCores: total.cpuCores + cores,
        memoryUsed: total.memoryUsed + stats.memUsed,
        memoryTotal: total.memoryTotal + stats.memTotal,
      };
    },
    { weightedCpu: 0, cpuCores: 0, memoryUsed: 0, memoryTotal: 0 },
  );
  const totalCpuPercent = serverTotals.cpuCores > 0
    ? serverTotals.weightedCpu / serverTotals.cpuCores
    : null;
  const totalMemoryPercent = serverTotals.memoryTotal > 0
    ? (serverTotals.memoryUsed / serverTotals.memoryTotal) * 100
    : null;

  useEffect(() => {
    if (totalCpuPercent != null) {
      setCpuHistory((history) => [...history, totalCpuPercent].slice(-24));
    }
    if (totalMemoryPercent != null) {
      setMemoryHistory((history) => [...history, totalMemoryPercent].slice(-24));
    }
  }, [serverStatsUpdatedAt, totalCpuPercent, totalMemoryPercent]);
  // "数据刷新时间": the most recent successful load of either the projects
  // payload or the live usage metrics.
  const lastDataAt = Math.max(projectsFetchedAt ?? 0, usageUpdatedAt ?? 0, serverStatsUpdatedAt ?? 0) || null;
  const lastDataAtParts = formatDateTimeParts(lastDataAt, locale);

  const filterCounts: Record<ResourceFilter, number> = {
    all: projects.length,
    projects: projectCount,
    apps: appCount,
    running: liveProjects.length,
    stopped: projects.length - liveProjects.length,
  };
  const filteredProjects = projects.filter((project) => {
    const status = getProjectStatus(project);
    const matchesFilter =
      filter === "all" ||
      (filter === "apps" && !!project.isApp) ||
      (filter === "projects" && !project.isApp) ||
      (filter === "running" && status === "live") ||
      (filter === "stopped" && status !== "live");
    const needle = query.trim().toLowerCase();
    const matchesSearch =
      !needle ||
      [project.name, project.framework, project.gitRepo, project.serverName, project.slug]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    return matchesFilter && matchesSearch;
  });

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshDone(false);
    refreshServerStats();
    const startedAt = Date.now();
    try {
      // Projects payload + live container metrics reload together.
      await Promise.all([refresh(), refreshUsage(true), refreshServers()]);
      setDataRefreshKey((key) => key + 1);
      // Keep the spinner visible for a perceptible minimum so a fast
      // response still reads as "working" instead of a no-op click.
      const elapsed = Date.now() - startedAt;
      if (elapsed < 600) {
        await new Promise((resolve) => setTimeout(resolve, 600 - elapsed));
      }
      setRefreshDone(true);
      showToast(labels.refreshSuccess, "success");
      if (refreshDoneTimer.current) clearTimeout(refreshDoneTimer.current);
      refreshDoneTimer.current = setTimeout(() => setRefreshDone(false), 2000);
    } catch {
      showToast(labels.refreshFailed, "error");
    } finally {
      setRefreshing(false);
    }
  };

  const handleProjectToggle = async (project: Project, enable: boolean) => {
    if (actionProjectId) return;
    setActionProjectId(project.id);
    try {
      await projectsApi.toggle(project.id, enable);
      setStopTarget(null);
      showToast(enable ? labels.startSuccess : labels.stopSuccess, "success");
      await Promise.all([refresh(), refreshUsage(true)]);
      setDataRefreshKey((key) => key + 1);
    } catch {
      showToast(labels.actionFailed, "error");
    } finally {
      setActionProjectId(null);
    }
  };

  const filters: { key: ResourceFilter; label: string }[] = [
    { key: "all", label: labels.all },
    { key: "projects", label: labels.projects },
    { key: "apps", label: labels.apps },
    { key: "running", label: labels.running },
    { key: "stopped", label: labels.stopped },
  ];

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <header className="mb-4 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <h1 className="min-h-8 truncate text-2xl font-medium tracking-[-0.02em] text-foreground/90">
              {localHour == null
                ? displayName || t.brand
                : displayName
                  ? interpolate(t.dashboard.home.greetingName, { greeting, name: displayName })
                  : greeting}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.dashboard.home.subtitle}</p>
          </div>
          <div className="flex w-full gap-3 xl:max-w-[700px]">
            <label className="relative flex min-w-0 flex-1 items-center">
              <Search className="pointer-events-none absolute start-4 size-4 text-muted-foreground" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={labels.search}
                className="h-12 w-full rounded-2xl border border-border/50 bg-card ps-11 pe-14 text-sm text-foreground outline-none transition focus:border-border focus:ring-2 focus:ring-primary/10"
              />
              <kbd className="pointer-events-none absolute end-3 rounded-md border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">⌘K</kbd>
            </label>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-2xl border border-border/50 bg-card px-4 text-sm font-medium text-foreground transition hover:bg-muted/40 active:scale-95 disabled:opacity-60"
            >
              {refreshDone ? (
                <Check className="size-4 text-emerald-400" />
              ) : (
                <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
              )}
              <span className="hidden sm:inline">{refreshDone ? labels.refreshed : labels.refresh}</span>
            </button>
          </div>
        </header>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_290px]">
          <main className="min-w-0">
            <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">
              <MetricCard icon={AppWindow} label={labels.totalResources} value={projects.length} detail={`${projectCount} ${labels.projects} · ${appCount} ${labels.apps}`} tone="green" loading={loading} />
              <MetricCard
                icon={Server}
                label={labels.serverConnections}
                value={connectedServers}
                detail={`${connectedServers} ${labels.connected} · ${disconnectedServers} ${labels.disconnected}`}
                tone="green"
                loading={serversLoading || !serverReachabilityLoaded}
              />
              <MetricCard
                icon={Gauge}
                label={labels.totalCpu}
                value={`${(totalCpuPercent ?? 0).toFixed(1)}%`}
                detail={interpolate(labels.measuredServers, { measured: String(serverStats.length), total: String(servers.length) })}
                tone="cyan"
                loading={serversLoading || serverStatsLoading}
                chart={{ values: cpuHistory, color: "rgb(34 211 238)" }}
              />
              <MetricCard
                icon={MemoryStick}
                label={labels.totalMemory}
                value={`${(totalMemoryPercent ?? 0).toFixed(1)}%`}
                detail={interpolate(labels.measuredServers, { measured: String(serverStats.length), total: String(servers.length) })}
                tone="violet"
                loading={serversLoading || serverStatsLoading}
                chart={{ values: memoryHistory, color: "rgb(139 92 246)" }}
              />
              <div className="col-span-2 md:col-span-1">
                <MetricCard
                  icon={Clock3}
                  label={labels.latestUpdate}
                  value={lastDataAtParts?.timePart ?? "—"}
                  valueClassName="text-[26px] tabular-nums"
                  detail={lastDataAtParts?.datePart ?? labels.unconfigured}
                  tone="neutral"
                  loading={loading}
                />
              </div>
            </section>

            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-foreground">{labels.resourceOverview}</h2>
                <div className="mt-2 flex max-w-full gap-1 overflow-x-auto pb-0.5">
                  {filters.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setFilter(item.key)}
                      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        filter === item.key
                          ? "border-border bg-foreground/[0.08] text-foreground"
                          : "border-transparent bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {item.label}
                      <span className="text-[10px] opacity-65">{filterCounts[item.key]}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
              {loading ? (
                <div className="divide-y divide-border/40">
                  {[0, 1, 2, 3, 4, 5].map((item) => (
                    <div key={item} className="flex h-[72px] animate-pulse items-center gap-4 px-5">
                      <div className="size-9 rounded-xl bg-muted" />
                      <div className="h-4 w-36 rounded bg-muted" />
                      <div className="ms-auto h-4 w-24 rounded bg-muted" />
                    </div>
                  ))}
                </div>
              ) : projects.length === 0 ? (
                <HomeWelcome />
              ) : filteredProjects.length === 0 ? (
                <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
                  <Search className="mb-3 size-7 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-foreground">{labels.noResults}</p>
                </div>
              ) : (
                <div className="max-w-full overflow-x-auto overscroll-x-contain">
                  <div className="min-w-[1180px]">
                    <div className="grid grid-cols-[minmax(180px,1.2fr)_74px_86px_112px_140px_190px_100px_96px_140px] items-center border-b border-border/50 px-5 py-3 text-[11px] font-medium text-muted-foreground">
                      <span>{labels.name}</span><span>{labels.type}</span><span>{labels.visibility}</span><span>{labels.stack}</span><span>{labels.location}</span><span>{labels.resources}</span><span>{labels.updated}</span><span>{labels.status}</span><span>{labels.actions}</span>
                    </div>
                    <div className="divide-y divide-border/40">
                      {filteredProjects.slice(0, 12).map((project) => {
                        const status = getProjectStatus(project);
                        const isStaticRuntime = isStaticProjectRuntime(project);
                        const usageUnavailableReason = status !== "live"
                          ? labels.usageStopped
                          : project.deployTarget === "cloud"
                            ? labels.usageCloud
                            : isStaticRuntime
                              ? labels.usageStatic
                              : project.serverId && failedServerIds.has(project.serverId)
                                ? labels.usageUnavailable
                                : labels.usageUnmatched;
                        const domainUrl = projectDomainUrl(project.primaryDomain);
                        return (
                          <div
                            key={project.id}
                            role="link"
                            tabIndex={0}
                            onClick={() => router.push(`/projects/${project.id}`)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                router.push(`/projects/${project.id}`);
                              }
                            }}
                            className="group grid min-h-[72px] cursor-pointer grid-cols-[minmax(180px,1.2fr)_74px_86px_112px_140px_190px_100px_96px_140px] items-center px-5 py-2.5 transition hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                          >
                            <div className="flex min-w-0 items-center gap-3 pe-4">
                              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/60">
                                <ResourceIcon project={project} />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
                                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{project.gitRepo || project.slug}</p>
                              </div>
                            </div>
                            <span className={`w-fit rounded-md px-2 py-1 text-[10px] font-medium ${project.isApp ? "bg-violet-500/10 text-violet-400" : "bg-cyan-500/10 text-cyan-400"}`}>
                              {project.isApp ? labels.apps : labels.projects}
                            </span>
                            <span className={`w-fit rounded-md px-2 py-1 text-[10px] font-medium ${project.isPubliclyAccessible ? "bg-emerald-500/10 text-emerald-400" : "bg-foreground/[0.06] text-muted-foreground"}`}>
                              {project.isPubliclyAccessible ? labels.public : labels.private}
                            </span>
                            <span className="truncate pe-3 text-xs text-foreground/75">{getFrameworkConfig(project.framework).name || "—"}</span>
                            <span className="flex min-w-0 items-center gap-1.5 pe-3 text-xs text-muted-foreground"><LocationIcon project={project} /><span className="truncate">{locationLabel(project, labels)}</span></span>
                            <div className="pe-5">
                              <UsageCell
                                live={status === "live"}
                                usage={usageByProject[project.id]}
                                loaded={usageLoaded}
                                unavailableReason={usageUnavailableReason}
                              />
                            </div>
                            <span className="truncate text-xs text-muted-foreground">
                              {formatRuntime(
                                project.runtimeStartedAt ??
                                  (isStaticRuntime
                                    ? project.updatedAt
                                    : project.activeDeploymentCreatedAt),
                                status === "live",
                                locale,
                                usageByProject[project.id]?.uptimeSeconds,
                              )}
                            </span>
                            <div className="flex min-w-0 items-center pe-1">
                              <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-medium ${PROJECT_STATUS_META[status].badge}`}>{projectStatusLabel(status, t)}</span>
                            </div>
                            <div
                              className="flex min-w-0 items-center justify-end gap-1"
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              <Link
                                href={project.serverId ? `/servers/${project.serverId}?tab=terminal` : "#"}
                                aria-label={labels.terminal}
                                title={labels.terminal}
                                aria-disabled={!project.serverId}
                                tabIndex={project.serverId ? 0 : -1}
                                onClick={(event) => { if (!project.serverId) event.preventDefault(); }}
                                className={`flex size-8 items-center justify-center rounded-lg transition-colors ${project.serverId ? "text-muted-foreground hover:bg-background hover:text-foreground" : "pointer-events-none text-muted-foreground/25"}`}
                              >
                                <Terminal className="size-4" />
                              </Link>
                              <Link
                                href={`/projects/${project.id}/logs`}
                                aria-label={labels.logs}
                                title={labels.logs}
                                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                              >
                                <ScrollText className="size-4" />
                              </Link>
                              <a
                                href={domainUrl ?? undefined}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={labels.openProject}
                                title={labels.openProject}
                                aria-disabled={!domainUrl}
                                tabIndex={domainUrl ? 0 : -1}
                                onClick={(event) => { if (!domainUrl) event.preventDefault(); }}
                                className={`flex size-8 items-center justify-center rounded-lg transition-colors ${domainUrl ? "text-muted-foreground hover:bg-background hover:text-foreground" : "pointer-events-none text-muted-foreground/25"}`}
                              >
                                <ExternalLink className="size-4" />
                              </a>
                              <button
                                type="button"
                                aria-label={status === "live" ? labels.stop : labels.start}
                                title={status === "live" ? labels.stop : labels.start}
                                disabled={actionProjectId !== null || (status !== "live" && status !== "disabled")}
                                onClick={() => status === "live" ? setStopTarget(project) : void handleProjectToggle(project, true)}
                                className={`flex size-8 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${status === "live" ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive" : "text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400"}`}
                              >
                                {actionProjectId === project.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : status === "live" ? (
                                  <PowerOff className="size-4" />
                                ) : (
                                  <Power className="size-4" />
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {projects.length > 12 && (
                    <div className="sticky start-0 flex w-[calc(100vw-2rem)] max-w-full items-center justify-center gap-2 border-t border-border/50 px-5 py-3 sm:w-[calc(100vw-3rem)] lg:w-[calc(100vw-4rem)] xl:w-auto">
                      <Link href="/projects" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
                        {labels.viewAllProjects}
                        <ArrowRight className="size-3.5 rtl:rotate-180" />
                      </Link>
                      <Link href="/apps" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
                        {labels.viewAllApps}
                        <ArrowRight className="size-3.5 rtl:rotate-180" />
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>

            <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {QUICK_LINKS.map(({ href, icon: Icon, key, description }) => (
                <Link
                  key={href}
                  href={href}
                  className="group rounded-xl border border-border/50 bg-card p-4 transition-all hover:border-border hover:bg-muted/40"
                >
                  <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-muted transition-transform group-hover:scale-105">
                    <Icon className="size-[18px] text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">{t.dashboard.home[key]}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.dashboard.home[description]}</p>
                </Link>
              ))}
              <a
                href="https://docs.vibrail.com/"
                target="_blank"
                rel="noreferrer"
                className="group rounded-xl border border-border/50 bg-card p-4 transition-all hover:border-border hover:bg-muted/40"
              >
                <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-muted transition-transform group-hover:scale-105">
                  <BookOpen className="size-[18px] text-muted-foreground" />
                </div>
                <p className="flex items-center gap-1 text-sm font-medium text-foreground">
                  {t.dashboard.home.docs}
                  <ExternalLink className="size-3 text-muted-foreground" />
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t.dashboard.home.docsDesc}</p>
              </a>
            </section>
          </main>

          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-2xl border border-border/50 bg-card p-5">
              <div className="mb-4 flex items-center gap-2"><Activity className="size-4 text-muted-foreground" /><h3 className="text-sm font-semibold text-foreground">{t.dashboard.home.activityTitle}</h3></div>
              <div className="space-y-3.5">
                {[
                  { icon: FolderKanban, label: t.dashboard.home.statsProjects, value: projectCount, color: "text-cyan-400" },
                  { icon: Boxes, label: labels.apps, value: appCount, color: "text-violet-400" },
                  { icon: Rocket, label: t.dashboard.home.statsDeployments, value: deploymentCount, color: "text-amber-400" },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label} className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className={`size-4 ${color}`} />{label}</span>{loading ? <span className="h-4 w-8 animate-pulse rounded bg-muted" /> : <span className="text-sm font-semibold text-foreground">{value}</span>}</div>
                ))}
                <div className="h-px bg-border/50" />
                <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-success" />{t.dashboard.home.successRate}</span>{loading ? <span className="h-4 w-10 animate-pulse rounded bg-muted" /> : <span className="text-sm font-semibold text-success">{successRate}%</span>}</div>
              </div>
            </div>
            <UpdatesBlock projectCount={projects.length} loading={loading} refreshKey={dataRefreshKey} />
            {!loading && projects.length === 0 && (
              <div className="rounded-2xl border border-border/50 bg-card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Boxes className="size-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">{t.dashboard.pages.apps.title}</h3>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Link
                      href="/apps/new"
                      aria-label={t.dashboard.pages.apps.createButton}
                      className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    >
                      <Plus className="size-4" />
                    </Link>
                    <Link
                      href="/apps"
                      aria-label={t.dashboard.home.viewAll}
                      className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    >
                      <ArrowRight className="size-4" />
                    </Link>
                  </div>
                </div>

                <div className="flex flex-col items-center pb-2 pt-0 text-center">
                  <svg className="-mt-1 mb-2 h-14" viewBox="0 0 130 64" fill="none" aria-hidden="true">
                    <circle cx="65" cy="32" r="22" fill="hsl(var(--primary))" fillOpacity="0.06" />
                    <path d="M42 32h8M80 32h8" stroke="var(--th-on-12)" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" />
                    <rect x="16" y="20" width="26" height="26" rx="8" fill="var(--th-sf-04)" stroke="var(--th-bd-default)" />
                    <rect x="24" y="28" width="10" height="10" rx="3" fill="var(--th-on-16)" />
                    <rect x="50" y="13" width="30" height="38" rx="9" fill="var(--th-card-bg)" stroke="var(--th-bd-default)" />
                    <rect x="57" y="20" width="9" height="9" rx="3" fill="hsl(var(--primary))" />
                    <rect x="57" y="33" width="16" height="3.5" rx="1.75" fill="var(--th-on-12)" />
                    <rect x="57" y="40" width="11" height="3.5" rx="1.75" fill="var(--th-on-08)" />
                    <rect x="88" y="20" width="26" height="26" rx="8" fill="var(--th-sf-04)" stroke="var(--th-bd-default)" />
                    <path d="M101 29v8M97 33h8" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <p className="text-sm font-medium text-foreground">{t.dashboard.home.appsEmptyTitle}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground/70">{t.dashboard.home.appsEmptyDesc}</p>
                  <div className="mt-3.5 flex items-center justify-center">
                    {FEATURED_APPS.slice(0, 6).map((app, index) => (
                      <div
                        key={app.id}
                        className={`flex size-7 items-center justify-center rounded-full border border-border/60 bg-card ${index > 0 ? "-ml-2" : ""}`}
                      >
                        <AppLogo appId={app.id} icon={app.icon} className="size-3.5" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
      {stopTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !actionProjectId) setStopTarget(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="stop-service-title" className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive"><Power className="size-5" /></div>
              <button type="button" aria-label={labels.cancel} disabled={!!actionProjectId} onClick={() => setStopTarget(null)} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"><X className="size-4" /></button>
            </div>
            <h2 id="stop-service-title" className="mt-4 text-lg font-semibold text-foreground">{labels.stopTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{interpolate(labels.stopDescription, { name: stopTarget.name })}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" disabled={!!actionProjectId} onClick={() => setStopTarget(null)} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50">{labels.cancel}</button>
              <button type="button" disabled={!!actionProjectId} onClick={() => void handleProjectToggle(stopTarget, false)} className="inline-flex min-w-28 items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-60">
                {actionProjectId ? <><Loader2 className="size-4 animate-spin" />{labels.stopping}</> : labels.confirmStop}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
