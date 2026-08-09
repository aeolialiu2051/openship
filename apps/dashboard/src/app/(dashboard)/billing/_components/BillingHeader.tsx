"use client";

import { useI18n } from "@/components/i18n-provider";

/**
 * Billing page header — title + subtitle shown once the layout confirms that
 * billing is available.
 *
 * The state-dependent PRO access-period line is passed in as `children` from
 * the server layout (see `BillingProPeriod`); it streams in separately inside a
 * Suspense boundary and never blocks this static header.
 */
export function BillingHeader({ children }: { children?: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <header>
      <h1
        className="text-2xl font-medium text-foreground/80"
        style={{ letterSpacing: "-0.2px" }}
      >
        {t.billing.layout.title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground/70">{t.billing.layout.subtitle}</p>
      {children}
    </header>
  );
}
