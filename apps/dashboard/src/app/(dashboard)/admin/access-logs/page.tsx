"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  adminApi,
  getApiErrorMessage,
  type AdminAccessLogRow,
  type AdminPage,
} from "@/lib/api";
import { useI18n } from "@/components/i18n-provider";
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

const PER_PAGE = 30;

function browserLabel(userAgent: string | null) {
  if (!userAgent) return "—";
  if (/Edg\//i.test(userAgent)) return "Edge";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/Chrome\//i.test(userAgent)) return "Chrome";
  if (/Safari\//i.test(userAgent)) return "Safari";
  return "Other";
}

export default function AdminAccessLogsPage() {
  const { locale } = useI18n();
  const copy = adminCopy(locale);
  const zh = locale === "zh";
  const [result, setResult] = useState<AdminPage<AdminAccessLogRow> | null>(null);
  const [page, setPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      setResult(await adminApi.accessLogs({ page, perPage: PER_PAGE, search, path }));
    } catch (err) {
      setError(getApiErrorMessage(err, copy.loadFailed));
    } finally {
      setRefreshing(false);
    }
  }, [copy.loadFailed, page, path, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{copy.accessLogs}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {zh
              ? "已登录用户的页面访问记录；不保存查询参数、页面正文或表单内容。"
              : "Authenticated page views without query strings, page content, or form data."}
          </p>
        </div>
        <AdminRefreshButton refreshing={refreshing} onRefresh={() => void load()} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchBox
          value={draftSearch}
          onChange={setDraftSearch}
          onSubmit={() => {
            setSearch(draftSearch.trim());
            setPage(1);
          }}
        />
        <input
          value={path}
          onChange={(event) => {
            setPath(event.target.value.trim());
            setPage(1);
          }}
          placeholder={zh ? "按路径筛选" : "Filter path"}
          className="h-10 rounded-xl border border-border/60 bg-card px-3 text-sm text-foreground outline-none sm:w-56"
        />
      </div>

      {error ? (
        <AdminError message={error} />
      ) : !result ? (
        <AdminLoading />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] text-left text-sm">
              <thead className="border-b border-border/50 bg-muted/20 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{zh ? "用户" : "User"}</th>
                  <th className="px-4 py-3 font-medium">{zh ? "路径" : "Path"}</th>
                  <th className="px-4 py-3 font-medium">{zh ? "组织 / 来源" : "Organization / referrer"}</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                  <th className="px-4 py-3 font-medium">{zh ? "浏览器" : "Browser"}</th>
                  <th className="px-4 py-3 font-medium">{zh ? "时间" : "Time"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {result.data.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-muted/15">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <span>{row.userName || row.userEmail || (zh ? "已删除用户" : "Deleted user")}</span>
                        {row.userRole === "admin" && <ShieldCheck className="size-3.5 text-primary" />}
                      </div>
                      <p className="mt-1 max-w-64 truncate text-xs text-muted-foreground">{row.userEmail ?? row.userId ?? "—"}</p>
                    </td>
                    <td className="px-4 py-4">
                      <code className="rounded-md bg-muted/50 px-2 py-1 text-xs text-foreground">{row.path}</code>
                      {row.sessionId && <p className="mt-2 font-mono text-[10px] text-muted-foreground/70">{row.sessionId}</p>}
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">
                      <p className="text-foreground">{row.organizationName || row.organizationId || "—"}</p>
                      <p className="mt-1 max-w-72 truncate" title={row.referrer ?? undefined}>{row.referrer ?? "—"}</p>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-muted-foreground">{row.ipAddress ?? "—"}</td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-foreground">{browserLabel(row.userAgent)}</p>
                      <p className="mt-1 max-w-72 truncate text-[11px] text-muted-foreground" title={row.userAgent ?? undefined}>
                        {row.userAgent ?? "—"}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">{formatDate(row.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.data.length === 0 && <EmptyRows />}
          <Pagination page={result.page} perPage={result.perPage} total={result.total} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
