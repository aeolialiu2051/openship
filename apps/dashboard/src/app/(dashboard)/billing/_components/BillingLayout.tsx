import { Suspense } from "react";
import { PageContainer } from "@/components/ui/PageContainer";
import { BillingTabBar } from "./BillingTabBar";
import { BillingHeader } from "./BillingHeader";
import { BillingProPeriod } from "./BillingProPeriod";
import { getBillingStateResult } from "../_lib/billing-state";

/**
 * Billing state gates the section chrome so unavailable installations do not
 * show navigation to unusable tabs. The request is shared with the tab page by
 * React `cache()`. Locale-sensitive PRO period formatting remains isolated in
 * a Suspense boundary and does not delay the rest of the available-state UI.
 */
export async function BillingLayout({ children }: { children: React.ReactNode }) {
  const result = await getBillingStateResult();

  if (result.kind !== "ok") {
    return <PageContainer className="space-y-6">{children}</PageContainer>;
  }

  return (
    <PageContainer className="space-y-6">
      <BillingHeader>
        <Suspense fallback={null}>
          <BillingProPeriod state={result.state} />
        </Suspense>
      </BillingHeader>

      <BillingTabBar />

      <div className="min-w-0 pt-1">{children}</div>
    </PageContainer>
  );
}
