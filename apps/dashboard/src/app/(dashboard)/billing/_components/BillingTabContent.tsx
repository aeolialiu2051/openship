"use client";

import dynamic from "next/dynamic";
import type { PlanTierId } from "@repo/core";
import type { BillingState } from "@/lib/api/billing";
import BillingTabSkeleton from "./BillingTabSkeleton";

export type BillingTab = "overview" | "usage" | "plans" | "topups" | "payment" | "invoices";

const BillingUsage = dynamic(
  () => import("@/components/billing/BillingUsage").then((mod) => mod.BillingUsage),
  { loading: BillingTabSkeleton },
);
const BillingTopups = dynamic(
  () => import("@/components/billing/BillingTopups").then((mod) => mod.BillingTopups),
  { loading: BillingTabSkeleton },
);
const BillingPlansRoute = dynamic(
  () => import("./BillingPlansRoute").then((mod) => mod.BillingPlansRoute),
  { loading: BillingTabSkeleton },
);
const PaymentMethodPanel = dynamic(
  () => import("./billing-shared").then((mod) => mod.PaymentMethodPanel),
  { loading: BillingTabSkeleton },
);
const InvoicesPanel = dynamic(
  () => import("./billing-shared").then((mod) => mod.InvoicesPanel),
  { loading: BillingTabSkeleton },
);

export function BillingTabContent({ tab, state }: { tab: BillingTab; state: BillingState }) {
  switch (tab) {
    case "overview":
      return <BillingPlansRoute currentPlan={state.tier as PlanTierId} />;
    case "usage":
      return <BillingUsage state={state} />;
    case "plans":
      return <BillingPlansRoute currentPlan={state.tier as PlanTierId} />;
    case "topups":
      return <BillingTopups state={state} />;
    case "payment":
      return <PaymentMethodPanel />;
    case "invoices":
      return <InvoicesPanel />;
  }
}
