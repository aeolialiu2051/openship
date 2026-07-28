"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Building2,
  CheckCircle2,
  FolderKanban,
  Rocket,
  Settings2,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import {
  adminApi,
  getApiErrorMessage,
  type AdminOverview,
  type AdminTrendGranularity,
  type AdminTrendRangeDays,
} from "@/lib/api";
import { useI18n } from "@/components/i18n-provider";
import { Modal } from "@/components/ui/Modal";
import { AdminError, AdminLoading, AdminRefreshButton } from "./_components/admin-ui";
import { adminCopy } from "./_components/admin-copy";

const PREFERENCES_STORAGE_KEY = "openship.admin.overview-preferences";

interface TrendPreferences {
  rangeDays: AdminTrendRangeDays;
  granularity: AdminTrendGranularity;
}

const DEFAULT_PREFERENCES: TrendPreferences = {
  rangeDays: 14,
  granularity: "day",
};

function isRangeDays(value: unknown): value is AdminTrendRangeDays {
  return value === 7 || value === 14 || value === 30;
}

function isGranularity(value: unknown): value is AdminTrendGranularity {
  return value === "hour" || value === "day" || value === "week";
}

function readPreferences(): TrendPreferences {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<TrendPreferences>;
    return {
      rangeDays: isRangeDays(parsed.rangeDays) ? parsed.rangeDays : DEFAULT_PREFERENCES.rangeDays,
      granularity: isGranularity(parsed.granularity)
        ? parsed.granularity
        : DEFAULT_PREFERENCES.granularity,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: number;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            {value.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/80">{detail}</p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  );
}

function granularityLabel(granularity: AdminTrendGranularity, zh: boolean) {
  if (granularity === "hour") return zh ? "小时" : "hour";
  if (granularity === "week") return zh ? "周" : "week";
  return zh ? "天" : "day";
}

function bucketLabel(bucket: string, granularity: AdminTrendGranularity) {
  if (granularity === "hour") return `${bucket.slice(5, 10)} ${bucket.slice(11, 16)}`;
  return bucket.slice(5);
}

function TrendChart({
  title,
  description,
  points,
  granularity,
  value,
  colorClass,
}: {
  title: string;
  description: string;
  points: AdminOverview["usageTrend"]["points"];
  granularity: AdminTrendGranularity;
  value: (point: AdminOverview["usageTrend"]["points"][number]) => number;
  colorClass: string;
}) {
  const maximum = Math.max(1, ...points.map(value));
  const labelEvery = Math.max(1, Math.ceil(points.length / 10));
  const showValues = points.length <= 40;
  const minWidth = Math.max(680, points.length * (granularity === "hour" ? 14 : 34));

  return (
    <section className="rounded-2xl border border-border/50 bg-card p-5 sm:p-6">
      <div className="mb-6">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="flex h-52 items-end gap-1.5" style={{ minWidth }}>
          {points.map((point, index) => {
            const count = value(point);
            const height = Math.max(3, (count / maximum) * 100);
            const showLabel = index % labelEvery === 0 || index === points.length - 1;
            return (
              <div key={point.bucket} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <span className={`text-[10px] font-medium text-foreground ${showValues ? "" : "invisible"}`}>
                  {count}
                </span>
                <div className="flex h-36 w-full items-end rounded-sm bg-muted/30">
                  <div
                    className={`w-full rounded-sm transition-all ${colorClass}`}
                    style={{ height: `${height}%` }}
                    title={`${point.bucket}: ${count}`}
                  />
                </div>
                <span className={`whitespace-nowrap text-[10px] text-muted-foreground ${showLabel ? "" : "invisible"}`}>
                  {bucketLabel(point.bucket, granularity)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PreferencesModal({
  open,
  zh,
  draft,
  onDraft,
  onClose,
  onSave,
}: {
  open: boolean;
  zh: boolean;
  draft: TrendPreferences;
  onDraft: (preferences: TrendPreferences) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal isOpen={open} onClose={onClose} width="460px" maxWidth="calc(100vw - 2rem)">
      <div className="p-6">
        <div className="pe-10">
          <h2 className="text-xl font-semibold text-foreground">{zh ? "偏好设置" : "Preferences"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {zh ? "设置总览趋势图的默认时间范围和颗粒度。" : "Set the default range and granularity for overview trends."}
          </p>
        </div>

        <div className="mt-6 space-y-5">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">{zh ? "默认范围" : "Default range"}</span>
            <select
              value={draft.rangeDays}
              onChange={(event) =>
                onDraft({ ...draft, rangeDays: Number(event.target.value) as AdminTrendRangeDays })
              }
              className="h-11 w-full rounded-xl border border-border/60 bg-card px-3 text-sm text-foreground outline-none focus:border-primary/50"
            >
              <option value={7}>{zh ? "7 天" : "7 days"}</option>
              <option value={14}>{zh ? "14 天" : "14 days"}</option>
              <option value={30}>{zh ? "30 天" : "30 days"}</option>
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">
              {zh ? "默认时间颗粒度" : "Default time granularity"}
            </span>
            <select
              value={draft.granularity}
              onChange={(event) =>
                onDraft({ ...draft, granularity: event.target.value as AdminTrendGranularity })
              }
              className="h-11 w-full rounded-xl border border-border/60 bg-card px-3 text-sm text-foreground outline-none focus:border-primary/50"
            >
              <option value="hour">{zh ? "小时" : "Hour"}</option>
              <option value="day">{zh ? "天" : "Day"}</option>
              <option value="week">{zh ? "周" : "Week"}</option>
            </select>
          </label>
        </div>

        <div className="mt-7 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-border/60 px-4 text-sm font-medium text-muted-foreground hover:bg-muted/40"
          >
            {zh ? "取消" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={onSave}
            className="h-10 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {zh ? "保存" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function AdminOverviewPage() {
  const { locale } = useI18n();
  const zh = locale === "zh";
  const copy = adminCopy(locale);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferences, setPreferences] = useState<TrendPreferences>(DEFAULT_PREFERENCES);
  const [draftPreferences, setDraftPreferences] = useState<TrendPreferences>(DEFAULT_PREFERENCES);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    const stored = readPreferences();
    setPreferences(stored);
    setDraftPreferences(stored);
    setPreferencesReady(true);
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      setData(
        await adminApi.overview({
          ...preferences,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        }),
      );
    } catch (err) {
      setError(getApiErrorMessage(err, zh ? "管理总览加载失败" : "Failed to load overview"));
    } finally {
      setRefreshing(false);
    }
  }, [preferences, zh]);

  useEffect(() => {
    if (preferencesReady) void load();
  }, [load, preferencesReady]);

  const openPreferences = () => {
    setDraftPreferences(preferences);
    setPreferencesOpen(true);
  };

  const savePreferences = () => {
    setPreferences(draftPreferences);
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(draftPreferences));
    setPreferencesOpen(false);
  };

  const cards = data
    ? [
        {
          label: zh ? "用户总数" : "Total users",
          value: data.users.total,
          detail: zh
            ? `${data.users.verified} 已验证 · ${data.users.admins} 管理员`
            : `${data.users.verified} verified · ${data.users.admins} admins`,
          icon: Users,
        },
        {
          label: zh
            ? `过去 ${data.periodMetrics.rangeDays} 天新增`
            : `New users (${data.periodMetrics.rangeDays}d)`,
          value: data.periodMetrics.newUsers,
          detail: zh
            ? `过去 24 小时 ${data.users.new24h}`
            : `${data.users.new24h} in the last 24h`,
          icon: UserPlus,
        },
        {
          label: zh
            ? `过去 ${data.periodMetrics.rangeDays} 天活跃`
            : `Active users (${data.periodMetrics.rangeDays}d)`,
          value: data.periodMetrics.activeUsers,
          detail: zh
            ? `${data.activeUsers.day} 日活 · ${data.activeUsers.sessions} 活跃会话`
            : `${data.activeUsers.day} daily · ${data.activeUsers.sessions} active sessions`,
          icon: Activity,
        },
        {
          label: zh ? "组织" : "Organizations",
          value: data.organizations.total,
          detail: zh ? `${data.organizations.teams} 个团队空间` : `${data.organizations.teams} team workspaces`,
          icon: Building2,
        },
        {
          label: zh ? "项目" : "Projects",
          value: data.projects,
          detail: zh ? "未删除的项目环境" : "Non-deleted project environments",
          icon: FolderKanban,
        },
        {
          label: zh
            ? `过去 ${data.periodMetrics.rangeDays} 天部署`
            : `Deployments (${data.periodMetrics.rangeDays}d)`,
          value: data.periodMetrics.deployments,
          detail: zh
            ? `${data.deployments.total} 总计 · ${data.periodMetrics.failedDeployments} 失败`
            : `${data.deployments.total} total · ${data.periodMetrics.failedDeployments} failed`,
          icon: Rocket,
        },
        {
          label: zh
            ? `过去 ${data.periodMetrics.rangeDays} 天成功部署`
            : `Successful deployments (${data.periodMetrics.rangeDays}d)`,
          value: data.periodMetrics.readyDeployments,
          detail: zh
            ? `${data.deployments.ready} 次累计成功`
            : `${data.deployments.ready} successful overall`,
          icon: CheckCircle2,
        },
        {
          label: zh
            ? `过去 ${data.periodMetrics.rangeDays} 天操作`
            : `Activity (${data.periodMetrics.rangeDays}d)`,
          value: data.periodMetrics.activity,
          detail: zh
            ? `过去 24 小时 ${data.activityLast24h}`
            : `${data.activityLast24h} in the last 24h`,
          icon: ShieldCheck,
        },
      ]
    : [];

  const trendDescription = data
    ? zh
      ? `${data.usageTrend.rangeDays} 天 · 按${granularityLabel(data.usageTrend.granularity, true)}`
      : `${data.usageTrend.rangeDays} days · by ${granularityLabel(data.usageTrend.granularity, false)}`
    : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">{copy.overview}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openPreferences}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border/60 bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
          >
            <Settings2 className="size-4" />
            {zh ? "偏好设置" : "Preferences"}
          </button>
          <AdminRefreshButton
            refreshing={!preferencesReady || refreshing}
            onRefresh={() => void load()}
          />
        </div>
      </div>

      {error ? (
        <AdminError message={error} />
      ) : !data ? (
        <AdminLoading />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => <StatCard key={card.label} {...card} />)}
          </div>

          <TrendChart
            title={zh ? "用户部署趋势" : "User deployment trend"}
            description={trendDescription}
            points={data.usageTrend.points}
            granularity={data.usageTrend.granularity}
            value={(point) => point.deployments}
            colorClass="bg-emerald-500/75"
          />

          <TrendChart
            title={zh ? "用户注册趋势" : "User registration trend"}
            description={trendDescription}
            points={data.usageTrend.points}
            granularity={data.usageTrend.granularity}
            value={(point) => point.registrations}
            colorClass="bg-primary/75"
          />
        </>
      )}

      <PreferencesModal
        open={preferencesOpen}
        zh={zh}
        draft={draftPreferences}
        onDraft={setDraftPreferences}
        onClose={() => setPreferencesOpen(false)}
        onSave={savePreferences}
      />
    </div>
  );
}
