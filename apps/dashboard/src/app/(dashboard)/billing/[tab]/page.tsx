import { notFound } from "next/navigation";
import { BillingUnavailable } from "../_components/BillingUnavailable";
import {
  BillingTabContent,
  type BillingTab,
} from "../_components/BillingTabContent";
import { getBillingStateResult } from "../_lib/billing-state";

export default async function BillingTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;

  const validTabs: BillingTab[] = ["overview", "usage", "plans", "topups", "payment", "invoices"];
  if (!validTabs.includes(tab as BillingTab)) {
    notFound();
  }

  const result = await getBillingStateResult();

  if (result.kind === "unavailable") {
    return <BillingUnavailable reason={result.reason} />;
  }

  return <BillingTabContent tab={tab as BillingTab} state={result.state} />;
}
