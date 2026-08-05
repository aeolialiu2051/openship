"use client";

import { useI18n } from "@/components/i18n-provider";
import type { BillingState } from "@/lib/api/billing";

export function BillingHeader({ state }: { state: BillingState }) {
  const { t, locale } = useI18n();
  const isPro = state.tier === "pro";
  return (
    <header className="pt-2">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {t.billing.layout.title}
      </h1>
      <p className="mt-2 text-base text-muted-foreground">{t.billing.layout.subtitle}</p>
      {isPro && (state.currentPeriod.start || state.currentPeriod.end) && (
        <p className="mt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{locale === "zh" ? "PRO 权限周期" : "PRO access period"}</span>
          {" · "}
          {formatDate(state.currentPeriod.start, locale)}
          <span className="mx-1.5">→</span>
          {formatDate(state.currentPeriod.end, locale)}
        </p>
      )}
    </header>
  );
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
