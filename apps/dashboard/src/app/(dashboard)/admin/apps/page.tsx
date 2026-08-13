"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppWindow,
  Ban,
  CheckCircle2,
  Cloud,
  ExternalLink,
  Loader2,
  Play,
  Server,
  TriangleAlert,
} from "lucide-react";
import {
  adminApi,
  getApiErrorMessage,
  type AdminApplicationRow,
  type AdminPage,
} from "@/lib/api";
import { useI18n } from "@/components/i18n-provider";
import { Modal } from "@/components/ui/Modal";
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

function deploymentLabel(status: string | null, zh: boolean) {
  const labels: Record<string, [string, string]> = {
    queued: ["排队中", "Queued"],
    building: ["构建中", "Building"],
    deploying: ["部署中", "Deploying"],
    ready: ["部署成功", "Deployed"],
    partial_failure: ["部分异常", "Partially failed"],
    failed: ["部署失败", "Failed"],
    cancelled: ["已取消", "Cancelled"],
    canceled: ["已取消", "Cancelled"],
    rejected: ["已拒绝", "Rejected"],
  };
  if (!status) return zh ? "尚未部署" : "Not deployed";
  return labels[status]?.[zh ? 0 : 1] ?? status;
}

function deploymentTone(status: string | null) {
  if (status === "ready") return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (status === "building" || status === "deploying" || status === "queued") {
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  }
  if (status === "partial_failure" || status === "failed" || status === "rejected") {
    return "bg-destructive/10 text-destructive";
  }
  return "bg-foreground/[0.06] text-muted-foreground";
}

function applicationUrl(row: AdminApplicationRow) {
  if (row.moderationStatus === "suspended") {
    const site = row.primaryDomain || row.latestDeploymentUrl || row.name;
    return `/suspended?site=${encodeURIComponent(site)}`;
  }
  if (row.primaryDomain) return `https://${row.primaryDomain}`;
  if (row.latestDeploymentUrl) {
    return /^https?:\/\//i.test(row.latestDeploymentUrl)
      ? row.latestDeploymentUrl
      : `https://${row.latestDeploymentUrl}`;
  }
  return null;
}

function ModerationModal({
  row,
  zh,
  busy,
  onClose,
  onConfirm,
}: {
  row: AdminApplicationRow | null;
  zh: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    setReason(row?.suspendedReason ?? "");
  }, [row]);

  if (!row) return null;
  const suspending = row.moderationStatus !== "suspended";

  return (
    <Modal
      isOpen
      onClose={onClose}
      width="500px"
      maxWidth="calc(100vw - 2rem)"
      closable={!busy}
    >
      <div className="p-6">
        <div className="pe-10">
          <h2 className="text-xl font-semibold text-foreground">
            {suspending ? (zh ? "下架应用" : "Take app offline") : (zh ? "恢复上线" : "Restore app")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {suspending
              ? zh
                ? `下架“${row.appName || row.name}”后，现有运行实例会停止，用户也无法通过重新部署绕过。项目和历史记录会保留。`
                : `Taking “${row.appName || row.name}” offline stops its running workload and blocks new deployments. Project data and history are retained.`
              : zh
                ? `恢复“${row.appName || row.name}”的当前部署并允许后续重新部署。`
                : `Restore the current deployment for “${row.appName || row.name}” and allow future deployments.`}
          </p>
        </div>

        {suspending && (
          <label className="mt-5 block space-y-2">
            <span className="text-sm font-medium text-foreground">
              {zh ? "下架原因" : "Reason"}
            </span>
            <textarea
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder={zh ? "例如：页面包含不符合平台规定的内容" : "For example: content violates platform rules"}
              required
              className="min-h-28 w-full resize-y rounded-xl border border-border/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            />
          </label>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy || (suspending && !reason.trim())}
            onClick={onClose}
            className="h-10 rounded-xl border border-border/60 px-4 text-sm font-medium text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
          >
            {zh ? "取消" : "Cancel"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(reason.trim())}
            className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white disabled:opacity-60 ${
              suspending ? "bg-destructive hover:bg-destructive/90" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {suspending ? (zh ? "确认下架" : "Take offline") : (zh ? "恢复上线" : "Restore")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function AdminApplicationsPage() {
  const { locale } = useI18n();
  const zh = locale === "zh";
  const [result, setResult] = useState<AdminPage<AdminApplicationRow> | null>(null);
  const [page, setPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [moderationStatus, setModerationStatus] = useState("");
  const [deploymentStatus, setDeploymentStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<AdminApplicationRow | null>(null);
  const [mutating, setMutating] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      setResult(
        await adminApi.applications({
          page,
          perPage: PER_PAGE,
          search,
          moderationStatus,
          deploymentStatus,
        }),
      );
    } catch (err) {
      setError(getApiErrorMessage(err, zh ? "应用清单加载失败" : "Failed to load applications"));
    } finally {
      setRefreshing(false);
    }
  }, [deploymentStatus, moderationStatus, page, search, zh]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageStats = useMemo(() => {
    const rows = result?.data ?? [];
    return {
      active: rows.filter((row) => row.moderationStatus === "active").length,
      suspended: rows.filter((row) => row.moderationStatus === "suspended").length,
      failed: rows.filter((row) => ["failed", "partial_failure"].includes(row.latestDeploymentStatus ?? "")).length,
    };
  }, [result]);

  const mutate = async (reason: string) => {
    if (!selected) return;
    setMutating(true);
    setError(null);
    setNotice(null);
    try {
      if (selected.moderationStatus === "suspended") {
        const response = await adminApi.resumeApplication(selected.id);
        setNotice(
          response.data.warning
            ? zh
              ? `应用已解除下架并允许重新部署，但原部署未能完全启动：${response.data.warning}`
              : `Application restored and redeployment is enabled, but the previous workload did not fully start: ${response.data.warning}`
            : zh
              ? "应用已恢复上线。"
              : "Application restored.",
        );
      } else {
        const response = await adminApi.suspendApplication(selected.id, reason || undefined);
        const warnings = [response.data.warning, response.data.emailWarning].filter(Boolean);
        setNotice(
          warnings.length
            ? zh
              ? `应用已下架，但有提示：${warnings.join("；")}`
              : `Application taken offline with warning: ${warnings.join("; ")}`
            : zh
              ? "应用已下架，通知邮件已发送给项目负责人。"
              : "Application taken offline and the owner was notified by email.",
        );
      }
      setSelected(null);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, zh ? "操作失败" : "Action failed"));
    } finally {
      setMutating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{zh ? "用户应用" : "User apps"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {zh ? "查看所有工作区部署的应用；发现不符合规定的内容时可直接下架。" : "Inspect deployed apps across all workspaces and take non-compliant sites offline."}
          </p>
        </div>
        <AdminRefreshButton refreshing={refreshing} onRefresh={() => void load()} />
      </div>

      {result && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/50 bg-card px-4 py-3 text-sm">
            <span className="text-muted-foreground">{zh ? "本页上线" : "Active on page"}</span>
            <strong className="ml-2 text-foreground">{pageStats.active}</strong>
          </div>
          <div className="rounded-xl border border-border/50 bg-card px-4 py-3 text-sm">
            <span className="text-muted-foreground">{zh ? "本页下架" : "Offline on page"}</span>
            <strong className="ml-2 text-destructive">{pageStats.suspended}</strong>
          </div>
          <div className="rounded-xl border border-border/50 bg-card px-4 py-3 text-sm">
            <span className="text-muted-foreground">{zh ? "本页部署异常" : "Deploy issues on page"}</span>
            <strong className="ml-2 text-amber-600 dark:text-amber-400">{pageStats.failed}</strong>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 lg:flex-row">
        <SearchBox
          value={draftSearch}
          onChange={setDraftSearch}
          onSubmit={() => {
            setSearch(draftSearch.trim());
            setPage(1);
          }}
          placeholder={zh ? "搜索应用、域名、工作区或用户邮箱…" : "Search app, domain, workspace, or owner email…"}
        />
        <select
          value={moderationStatus}
          onChange={(event) => {
            setModerationStatus(event.target.value);
            setPage(1);
          }}
          className="h-10 rounded-xl border border-border/60 bg-card px-3 text-sm text-foreground"
        >
          <option value="">{zh ? "全部上线状态" : "All availability"}</option>
          <option value="active">{zh ? "已上线" : "Active"}</option>
          <option value="suspended">{zh ? "已下架" : "Offline"}</option>
        </select>
        <select
          value={deploymentStatus}
          onChange={(event) => {
            setDeploymentStatus(event.target.value);
            setPage(1);
          }}
          className="h-10 rounded-xl border border-border/60 bg-card px-3 text-sm text-foreground"
        >
          <option value="">{zh ? "全部部署状态" : "All deployments"}</option>
          <option value="ready">{zh ? "部署成功" : "Deployed"}</option>
          <option value="building">{zh ? "构建中" : "Building"}</option>
          <option value="deploying">{zh ? "部署中" : "Deploying"}</option>
          <option value="failed">{zh ? "部署失败" : "Failed"}</option>
          <option value="partial_failure">{zh ? "部分异常" : "Partially failed"}</option>
        </select>
      </div>

      {notice && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </div>
      )}
      {error ? (
        <AdminError message={error} />
      ) : !result ? (
        <AdminLoading />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="border-b border-border/50 bg-muted/20 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{zh ? "应用" : "Application"}</th>
                  <th className="px-4 py-3 font-medium">{zh ? "所属账户" : "Owner"}</th>
                  <th className="px-4 py-3 font-medium">{zh ? "访问地址" : "Address"}</th>
                  <th className="px-4 py-3 font-medium">{zh ? "部署状态" : "Deployment"}</th>
                  <th className="px-4 py-3 font-medium">{zh ? "上线状态" : "Availability"}</th>
                  <th className="px-4 py-3 font-medium">{zh ? "最近部署" : "Last deployment"}</th>
                  <th className="px-4 py-3 text-right font-medium">{zh ? "操作" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {result.data.map((row) => {
                  const url = applicationUrl(row);
                  const suspended = row.moderationStatus === "suspended";
                  return (
                    <tr key={row.id} className="align-top hover:bg-muted/15">
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <AppWindow className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="max-w-64 truncate font-medium text-foreground">{row.appName || row.name}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {row.environmentName} · {row.framework || row.appTemplateId || row.gitProvider || "—"}
                            </p>
                            <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">{row.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="max-w-52 truncate font-medium text-foreground">{row.organizationName}</p>
                        <p className="mt-1 max-w-60 truncate text-xs text-muted-foreground">{row.ownerName || row.ownerEmail || "—"}</p>
                        {row.ownerName && row.ownerEmail && (
                          <p className="max-w-60 truncate text-xs text-muted-foreground">{row.ownerEmail}</p>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex max-w-64 items-center gap-1.5 text-primary hover:underline"
                          >
                            <span className="truncate">{row.primaryDomain || row.latestDeploymentUrl}</span>
                            <ExternalLink className="size-3.5 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          {row.cloudWorkspaceId ? <Cloud className="size-3.5" /> : <Server className="size-3.5" />}
                          {row.cloudWorkspaceId ? (zh ? "云端" : "Cloud") : (zh ? "自托管" : "Self-hosted")}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${deploymentTone(row.latestDeploymentStatus)}`}>
                          {["building", "deploying", "queued"].includes(row.latestDeploymentStatus ?? "") ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : ["failed", "partial_failure", "rejected"].includes(row.latestDeploymentStatus ?? "") ? (
                            <TriangleAlert className="size-3" />
                          ) : (
                            <CheckCircle2 className="size-3" />
                          )}
                          {deploymentLabel(row.latestDeploymentStatus, zh)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${suspended ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>
                          {suspended ? <Ban className="size-3" /> : <CheckCircle2 className="size-3" />}
                          {suspended ? (zh ? "已下架" : "Offline") : (zh ? "已上线" : "Active")}
                        </span>
                        {suspended && row.suspendedReason && (
                          <p className="mt-2 max-w-56 text-xs leading-5 text-muted-foreground" title={row.suspendedReason}>
                            {row.suspendedReason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs text-muted-foreground">
                        <p>{formatDate(row.latestDeploymentCreatedAt, locale)}</p>
                        {row.gitOwner && row.gitRepo && <p className="mt-1 max-w-48 truncate">{row.gitOwner}/{row.gitRepo}</p>}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          disabled={row.appTemplateId === "vibrail"}
                          title={row.appTemplateId === "vibrail" ? (zh ? "不能下架控制面" : "The control plane cannot be taken offline") : undefined}
                          onClick={() => setSelected(row)}
                          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${suspended ? "border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400" : "border-destructive/30 text-destructive hover:bg-destructive/10"}`}
                        >
                          {suspended ? <Play className="size-3.5" /> : <Ban className="size-3.5" />}
                          {suspended ? (zh ? "恢复上线" : "Restore") : (zh ? "下架" : "Take offline")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {result.data.length === 0 && <EmptyRows />}
          <Pagination page={result.page} perPage={result.perPage} total={result.total} onPage={setPage} />
        </div>
      )}

      <ModerationModal
        row={selected}
        zh={zh}
        busy={mutating}
        onClose={() => {
          if (!mutating) setSelected(null);
        }}
        onConfirm={(reason) => void mutate(reason)}
      />
    </div>
  );
}
