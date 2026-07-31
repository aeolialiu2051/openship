"use client";

import { Loader2, RefreshCw, Search } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { adminCopy } from "./admin-copy";
import { parseAdminDate } from "./admin-date";

export function formatDate(value: string | null | undefined, locale: string) {
  const date = parseAdminDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function AdminLoading() {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-2xl border border-border/50 bg-card">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export function AdminError({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
      {message}
    </div>
  );
}

export function AdminRefreshButton({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { locale } = useI18n();
  const copy = adminCopy(locale);
  return (
    <button
      type="button"
      disabled={refreshing}
      onClick={onRefresh}
      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-border/60 bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
      {copy.refresh}
    </button>
  );
}

export function EmptyRows() {
  const { locale } = useI18n();
  return (
    <div className="px-4 py-12 text-center text-sm text-muted-foreground">
      {adminCopy(locale).noData}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  onSubmit,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
}) {
  const { locale } = useI18n();
  const copy = adminCopy(locale);
  return (
    <form
      className="relative w-full max-w-xl"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? copy.search}
        className="h-10 w-full rounded-xl border border-border/60 bg-card pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary/50"
      />
    </form>
  );
}

export function Pagination({
  page,
  perPage,
  total,
  onPage,
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const { locale } = useI18n();
  const copy = adminCopy(locale);
  const pages = Math.max(1, Math.ceil(total / perPage));
  return (
    <div className="flex items-center justify-between border-t border-border/50 px-4 py-3 text-xs text-muted-foreground">
      <span>{total.toLocaleString()} {locale === "zh" ? "条记录" : "records"}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="rounded-lg border border-border/60 px-3 py-1.5 disabled:opacity-40"
        >
          {copy.previous}
        </button>
        <span>{page} / {pages}</span>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className="rounded-lg border border-border/60 px-3 py-1.5 disabled:opacity-40"
        >
          {copy.next}
        </button>
      </div>
    </div>
  );
}
