import { PageContainer } from "@/components/ui/PageContainer";
import type { BillingState } from "./billing-shared";
import { BillingTabBar } from "./BillingTabBar";
import { BillingHeader } from "./BillingHeader";
import { getBillingStateResult } from "../_lib/billing-state";

export async function BillingLayout({ children }: { children: React.ReactNode }) {
  const result = await getBillingStateResult();
  const state: BillingState | null = result.kind === "ok" ? result.state : null;

  // No billing state — cloud not connected, billing not enabled, or the fetch
  // errored. Don't render the header + tab-bar chrome (and its formatters) above
  // an "unavailable" screen: the tab page renders <BillingUnavailable> with the
  // precise reason. This also keeps billing effectively cloud-gated when reached
  // by direct URL / RSC prefetch (the sidebar link is already hidden).
  if (!state) {
    return <PageContainer className="space-y-6">{children}</PageContainer>;
  }

  return (
    <PageContainer className="space-y-6">
      <BillingHeader state={state} />

      <BillingTabBar />

      <div className="min-w-0 pt-1">{children}</div>
    </PageContainer>
  );
}
