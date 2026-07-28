"use client";

import { useCallback, useEffect, useState } from "react";
import {
  adminApi,
  getApiErrorMessage,
  type AdminActivityLogRow,
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

function JsonDiff({ row, zh }: { row: AdminActivityLogRow; zh: boolean }) {
  if (row.before == null && row.after == null) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-medium text-primary">
        {zh ? "查看变更" : "View changes"}
      </summary>
      <div className="mt-2 grid max-w-2xl gap-2 md:grid-cols-2">
        {row.before != null && (
          <pre className="max-h-48 overflow-auto rounded-lg bg-muted/40 p-2 text-[10px] text-muted-foreground">
            {JSON.stringify(row.before, null, 2)}
          </pre>
        )}
        {row.after != null && (
          <pre className="max-h-48 overflow-auto rounded-lg bg-muted/40 p-2 text-[10px] text-muted-foreground">
            {JSON.stringify(row.after, null, 2)}
          </pre>
        )}
      </div>
    </details>
  );
}

export default function AdminActivityPage() {
  const { locale } = useI18n();
  const copy = adminCopy(locale);
  const zh = locale === "zh";
  const [result, setResult] = useState<AdminPage<AdminActivityLogRow> | null>(null);
  const [page, setPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      setResult(await adminApi.activityLogs({ page, perPage: PER_PAGE, search, eventType }));
    } catch (err) {
      setError(getApiErrorMessage(err, copy.loadFailed));
    } finally {
      setRefreshing(false);
    }
  }, [copy.loadFailed, eventType, page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{copy.activityLogs}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {zh
              ? "跨所有组织的重要操作、资源变更和系统事件。"
              : "Important actions, resource changes, and system events across every organization."}
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
          value={eventType}
          onChange={(event) => {
            setEventType(event.target.value.trim());
            setPage(1);
          }}
          placeholder={zh ? "按事件类型筛选" : "Filter event type"}
          className="h-10 rounded-xl border border-border/60 bg-card px-3 text-sm text-foreground outline-none sm:w-56"
        />
      </div>

      {error ? (
        <AdminError message={error} />
      ) : !result ? (
        <AdminLoading />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
          <div className="divide-y divide-border/50">
            {result.data.map((row) => (
              <article key={row.id} className="p-4 hover:bg-muted/15">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-primary/10 px-2 py-1 font-mono text-xs font-medium text-primary">
                        {row.eventType}
                      </span>
                      {row.resourceType && (
                        <span className="text-xs text-muted-foreground">
                          {row.resourceType}{row.resourceId ? ` · ${row.resourceId}` : ""}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-foreground">
                      {row.actorName || row.actorEmail || (zh ? "系统" : "System")}
                      {row.actorEmail && row.actorName ? (
                        <span className="text-muted-foreground"> · {row.actorEmail}</span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.organizationName || row.organizationId}
                      {row.ipAddress ? ` · ${row.ipAddress}` : ""}
                    </p>
                    <JsonDiff row={row} zh={zh} />
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(row.createdAt, locale)}
                  </time>
                </div>
              </article>
            ))}
          </div>
          {result.data.length === 0 && <EmptyRows />}
          <Pagination page={result.page} perPage={result.perPage} total={result.total} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
