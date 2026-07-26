import { PageContainer } from "@/components/ui/PageContainer";
import { BillingSidebar, type BillingState } from "./billing-shared";
import { BillingTabBar } from "./BillingTabBar";
import { BillingContent } from "./BillingContent";
import { BillingHeader } from "./BillingHeader";
import { getBillingStateResult } from "../_lib/billing-state";

export async function BillingLayout({ children }: { children: React.ReactNode }) {
  const result = await getBillingStateResult();
  const state: BillingState | null = result.kind === "ok" ? result.state : null;

  return (
    <PageContainer className="space-y-6">
      <BillingHeader state={state} />

      <BillingTabBar />

      <BillingContent sidebar={state ? <BillingSidebar state={state} /> : null}>
        {children}
      </BillingContent>
    </PageContainer>
  );
}
