import type { BillingState } from "@/lib/api/billing";
import { getRequestLocale } from "@/lib/server/locale";

/**
 * PRO access-period line shown beneath the billing page subtitle.
 *
 * Kept as an async server component because locale resolution is request-bound.
 * The layout supplies its already-fetched billing snapshot, avoiding another
 * state lookup while allowing this line to stream through Suspense.
 */
export async function BillingProPeriod({ state }: { state: BillingState }) {
  const { tier, currentPeriod } = state;
  if (tier !== "pro") return null;
  if (!currentPeriod.start && !currentPeriod.end) return null;

  const locale = await getRequestLocale();

  return (
    <p className="mt-3 text-sm text-muted-foreground/70">
      <span className="font-medium text-foreground">
        {locale === "zh" ? "PRO 权限周期" : "PRO access period"}
      </span>
      {" · "}
      {formatDate(currentPeriod.start, locale)}
      <span className="mx-1.5">→</span>
      {formatDate(currentPeriod.end, locale)}
    </p>
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
