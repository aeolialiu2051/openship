"use client";

import { useEffect, useState } from "react";
import { PricingCards, type ApiPlan } from "@/components/billing/PricingCards";
import { api } from "@/lib/api/client";
import { endpoints } from "@/lib/api/endpoints";
import type { PlanTierId } from "@repo/core";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

interface PlansResponse {
  data: { plans: ApiPlan[] };
}

interface CheckoutResponse {
  data: { checkoutUrl: string };
}

export function BillingPlansRoute({
  currentPlan,
  currentInterval,
}: {
  currentPlan: PlanTierId;
  currentInterval?: "monthly" | "annual" | null;
}) {
  const { t, locale } = useI18n();
  const [plans, setPlans] = useState<ApiPlan[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");

  useEffect(() => {
    let cancelled = false;
    async function fetchPlans() {
      try {
        const res = await api.get<PlansResponse>(endpoints.billing.plans);
        if (!cancelled) setPlans(res.data.plans);
      } catch {
        if (!cancelled) setError(t.billing.plansRoute.loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchPlans();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectPlan = async (planTierId: PlanTierId) => {
    if (planTierId === "free" || (planTierId === currentPlan && currentInterval === interval)) return;
    const checkoutWindow = window.open("about:blank", "_blank");
    if (!checkoutWindow) {
      setError(locale === "zh" ? "浏览器阻止了新窗口，请允许弹出窗口后重试" : "Your browser blocked the new window. Allow pop-ups and try again.");
      return;
    }
    checkoutWindow.opener = null;
    setSubscribing(planTierId);
    try {
      // Body key MUST be `planTierId` — the backend `createSubscriptionSchema`
      // validates that exact field (the old `planId` silently 400'd).
      const res = await api.post<CheckoutResponse>("billing/subscription", {
        planTierId,
        interval,
      });
      checkoutWindow.location.href = res.data.checkoutUrl;
    } catch (err) {
      checkoutWindow.close();
      setError(err instanceof Error ? err.message : t.billing.plansRoute.checkoutError);
      setSubscribing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !plans) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">{error || t.billing.plansRoute.genericError}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 text-sm font-medium text-primary hover:underline"
        >
          {t.billing.plansRoute.tryAgain}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-7">
      <div className="flex justify-center">
        <div className="grid w-[270px] grid-cols-2 rounded-full border border-border/45 bg-card/70 p-1 shadow-sm">
          {(["monthly", "annual"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setInterval(value)}
              className={`rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${
                interval === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {value === "monthly"
                ? locale === "zh" ? "月付" : "Monthly"
                : locale === "zh" ? "年付" : "Annual"}
            </button>
          ))}
        </div>
      </div>
      <PricingCards
        plans={plans}
        currentPlan={currentPlan}
        currentInterval={currentInterval}
        interval={interval}
        onSelectPlan={handleSelectPlan}
        subscribingPlan={subscribing}
      />
    </div>
  );
}
