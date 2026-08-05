"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { adminApi, getApiErrorMessage, type AdminPage, type AdminUserRow } from "@/lib/api";
import { useI18n } from "@/components/i18n-provider";
import { PlanBadge } from "@/components/plan-badge";
import { adminCopy } from "../_components/admin-copy";
import {
  AdminError,
  AdminLoading,
  AdminRefreshButton,
  EmptyRows,
  formatDate,
  Pagination,
  SearchBox,
} from "../_components/admin-ui";

const PER_PAGE = 25;

export default function AdminUsersPage() {
  const { locale } = useI18n();
  const copy = adminCopy(locale);
  const zh = locale === "zh";
  const [result, setResult] = useState<AdminPage<AdminUserRow> | null>(null);
  const [page, setPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [proPeriod, setProPeriod] = useState<{ row: AdminUserRow; start: string; end: string } | null>(null);
  const proDialogRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      setResult(await adminApi.users({ page, perPage: PER_PAGE, search, role }));
    } catch (err) {
      setError(getApiErrorMessage(err, copy.loadFailed));
    } finally {
      setRefreshing(false);
    }
  }, [copy.loadFailed, page, role, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!proPeriod) return;

    proDialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProPeriod(null);
    };
    const closeOnWindowBlur = () => setProPeriod(null);
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (proDialogRef.current && !proDialogRef.current.contains(event.target as Node)) {
        setProPeriod(null);
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("blur", closeOnWindowBlur);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("blur", closeOnWindowBlur);
    };
  }, [proPeriod]);

  const updatePlan = async (
    row: AdminUserRow,
    planTierId: "free" | "pro",
    period?: { periodStart: string; periodEnd: string },
  ) => {
    const targetUserId = row.id;
    const confirmed =
      planTierId === "pro"
        ? true
        : window.confirm(
            zh
              ? `确认将 ${row.name || row.email} 降级为 FREE 用户吗？套餐额度会立即降低。`
              : `Downgrade ${row.name || row.email} to FREE? The plan quota will be reduced immediately.`,
          );
    if (!confirmed) return;

    setUpdatingUserId(targetUserId);
    setError(null);
    try {
      const response = await adminApi.updateUserPlan(targetUserId, planTierId, period);
      setResult((current) =>
        current
          ? {
              ...current,
              data: current.data.map((row) =>
                row.id === targetUserId
                  ? {
                      ...row,
                      planTierId,
                      currentPeriodStart: response.data.currentPeriodStart,
                      currentPeriodEnd: response.data.currentPeriodEnd,
                    }
                  : row,
              ),
            }
          : current,
      );
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          planTierId === "pro"
            ? zh ? "升级 PRO 失败" : "Failed to promote user to Pro"
            : zh ? "降级 FREE 失败" : "Failed to downgrade user to Free",
        ),
      );
    } finally {
      setUpdatingUserId(null);
      setProPeriod(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{copy.users}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {zh ? "所有实例用户及其资源和最近活动。" : "All instance users, resources, and recent activity."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-border/60 bg-card px-3 text-sm text-foreground"
          >
            <option value="">{copy.all}</option>
            <option value="admin">{copy.admin}</option>
            <option value="user">{copy.user}</option>
          </select>
          <AdminRefreshButton refreshing={refreshing} onRefresh={() => void load()} />
        </div>
      </div>

      <SearchBox
        value={draftSearch}
        onChange={setDraftSearch}
        onSubmit={() => {
          setSearch(draftSearch.trim());
          setPage(1);
        }}
      />

      {error ? (
        <AdminError message={error} />
      ) : !result ? (
        <AdminLoading />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1160px] text-left text-sm">
              <thead className="border-b border-border/50 bg-muted/20 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{zh ? "用户" : "User"}</th>
                  <th className="px-4 py-3 font-medium">{zh ? "状态" : "Status"}</th>
                  <th className="px-4 py-3 font-medium">{zh ? "套餐" : "Plan"}</th>
                  <th className="px-4 py-3 font-medium">{zh ? "资源" : "Resources"}</th>
                  <th className="px-4 py-3 font-medium">{zh ? "活跃会话" : "Sessions"}</th>
                  <th className="px-4 py-3 font-medium">{zh ? "最近访问" : "Last seen"}</th>
                  <th className="px-4 py-3 font-medium">{zh ? "注册时间" : "Registered"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {result.data.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-muted/15">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground/[0.07] font-semibold uppercase">
                          {(row.name || row.email)[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-medium text-foreground">
                            <span className="max-w-56 truncate">{row.name}</span>
                            {row.role === "admin" && <ShieldCheck className="size-3.5 text-primary" />}
                          </div>
                          <p className="max-w-64 truncate text-xs text-muted-foreground">{row.email}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">{row.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2 py-1 text-xs font-medium text-foreground">
                        {row.role === "admin" ? copy.admin : copy.user}
                      </span>
                      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        {row.emailVerified ? (
                          <CheckCircle2 className="size-3.5 text-emerald-500" />
                        ) : (
                          <XCircle className="size-3.5 text-amber-500" />
                        )}
                        {row.emailVerified ? copy.verified : copy.unverified}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <PlanBadge planTierId={row.planTierId} />
                      <button
                        type="button"
                        disabled={updatingUserId !== null}
                        onClick={() =>
                          row.planTierId === "free"
                            ? setProPeriod({ row, start: todayInput(), end: dateAfter(todayInput(), 30) })
                            : void updatePlan(row, "free")
                        }
                        className="mt-2 flex h-8 items-center gap-1.5 rounded-lg border border-border/60 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/40 disabled:opacity-50"
                      >
                        {updatingUserId === row.id && <Loader2 className="size-3.5 animate-spin" />}
                        {row.planTierId === "free"
                          ? zh ? "提升为 PRO" : "Promote to PRO"
                          : zh ? "降级为 FREE" : "Downgrade to FREE"}
                      </button>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">
                      <p>{row.organizationCount} {zh ? "组织" : "orgs"}</p>
                      <p>{row.projectCount} {zh ? "项目" : "projects"}</p>
                      <p>{row.deploymentCount} {zh ? "部署" : "deployments"}</p>
                    </td>
                    <td className="px-4 py-4 font-medium text-foreground">{row.activeSessionCount}</td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">
                      <p>{formatDate(row.lastSeenAt, locale)}</p>
                      {row.lastActionAt && (
                        <p className="mt-1">{zh ? "操作" : "Action"}: {formatDate(row.lastActionAt, locale)}</p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">
                      {formatDate(row.createdAt, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.data.length === 0 && <EmptyRows />}
          <Pagination page={result.page} perPage={result.perPage} total={result.total} onPage={setPage} />
        </div>
      )}

      {proPeriod && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-[2px]"
          role="presentation"
        >
          <div
            ref={proDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pro-period-dialog-title"
            tabIndex={-1}
            className="w-full max-w-lg rounded-2xl border border-border/80 bg-background p-6 text-foreground shadow-2xl outline-none sm:p-7"
          >
            <h3 id="pro-period-dialog-title" className="text-lg font-semibold text-foreground">
              {zh ? "设置 PRO 周期" : "Set PRO period"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {zh ? `为 ${proPeriod.row.name || proPeriod.row.email} 选择权限有效期。` : `Choose the access period for ${proPeriod.row.name || proPeriod.row.email}.`}
            </p>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm text-muted-foreground">
                {zh ? "开始日期" : "Start date"}
                <input
                  type="date"
                  value={proPeriod.start}
                  onChange={(event) => setProPeriod({ ...proPeriod, start: event.target.value })}
                  className="mt-1 h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-foreground"
                />
              </label>
              <label className="text-sm text-muted-foreground">
                {zh ? "截止日期" : "End date"}
                <input
                  type="date"
                  min={proPeriod.start}
                  value={proPeriod.end}
                  onChange={(event) => setProPeriod({ ...proPeriod, end: event.target.value })}
                  className="mt-1 h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-foreground"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t border-border/60 pt-5">
              <button type="button" onClick={() => setProPeriod(null)} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40">
                {zh ? "取消" : "Cancel"}
              </button>
              <button
                type="button"
                disabled={!proPeriod.start || !proPeriod.end || proPeriod.end < proPeriod.start || updatingUserId !== null}
                onClick={() => void updatePlan(proPeriod.row, "pro", { periodStart: proPeriod.start, periodEnd: proPeriod.end })}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {zh ? "确认提升" : "Promote to PRO"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function dateAfter(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
