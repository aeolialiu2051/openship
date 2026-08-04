"use client";

import { useI18n } from "@/components/i18n-provider";

export function BillingHeader() {
  const { t } = useI18n();
  return (
    <header className="pt-2">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {t.billing.layout.title}
      </h1>
      <p className="mt-2 text-base text-muted-foreground">{t.billing.layout.subtitle}</p>
    </header>
  );
}
