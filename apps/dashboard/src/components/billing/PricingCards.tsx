"use client";

import React from "react";
import { ArrowUpRight, Check, Loader2, Sparkles } from "lucide-react";
import type { PlanTierId } from "@repo/core";
import { useI18n } from "@/components/i18n-provider";

export interface ApiPlan {
  id: PlanTierId;
  name: string;
  description: string;
  popular: boolean;
  price: { monthly: number | null; annual: number | null };
  promotionalPrice?: { monthly: number | null; annual: number | null };
  monthlyCredits: number | null;
  features: string[];
  support: string;
  contactSales?: string | null;
}

interface PricingCardsProps {
  plans: ApiPlan[];
  currentPlan?: PlanTierId;
  interval: "monthly" | "annual";
  onSelectPlan?: (planId: PlanTierId) => void;
  subscribingPlan?: string | null;
}

export const PricingCards: React.FC<PricingCardsProps> = ({
  plans,
  currentPlan = "free",
  interval,
  onSelectPlan,
  subscribingPlan,
}) => {
  const { t } = useI18n();
  const visiblePlans = plans.filter(
    (plan): plan is ApiPlan & { id: "free" | "pro" } =>
      plan.id === "free" || plan.id === "pro",
  );

  return (
    <div className="grid w-full gap-5 md:grid-cols-2">
      {visiblePlans.map((plan) => {
        const isPro = plan.id === "pro";
        const isCurrent = currentPlan === plan.id;
        const originalPrice = plan.price[interval];
        const promotionalPrice = isPro ? plan.promotionalPrice?.[interval] : null;
        const hasPromotion = promotionalPrice !== null && promotionalPrice !== undefined;
        const price = hasPromotion ? promotionalPrice : originalPrice;
        const isSubscribing = subscribingPlan === plan.id;
        const copy = t.billing.pricing.cards[plan.id];

        return (
          <article
            key={plan.id}
            className={`relative flex min-h-[500px] flex-col overflow-hidden rounded-3xl border p-7 transition-colors sm:p-9 ${
              isPro
                ? "border-[#5f68e9]/55 bg-[radial-gradient(circle_at_82%_18%,rgba(65,123,234,0.10),transparent_36%),radial-gradient(circle_at_18%_100%,rgba(121,84,232,0.08),transparent_42%),hsl(var(--card))] shadow-[0_18px_55px_-32px_rgba(79,103,234,0.82),0_0_0_1px_rgba(95,104,233,0.08)]"
                : "border-border/45 bg-card shadow-[0_18px_45px_-38px_rgba(0,0,0,0.8)]"
            }`}
          >
            {isPro && hasPromotion && (
              <span className="absolute end-7 top-8 rounded-full bg-[linear-gradient(135deg,#417bea,#7954e8)] px-3 py-1 text-[11px] font-semibold text-white shadow-sm sm:end-9">
                {t.billing.pricing.limitedOffer}
              </span>
            )}

            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-foreground">{plan.name}</h2>
              {isPro && <Sparkles className="size-4 text-[#6170ea]" />}
            </div>
            <p className="mt-2 min-h-10 pe-16 text-[13px] leading-5 text-muted-foreground sm:pe-20">
              {copy.description}
            </p>

            <div className="mt-6 flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight text-foreground tabular-nums">
                {price === null ? "—" : `$${Math.round(price / 100)}`}
              </span>
              {price !== 0 && price !== null && (
                <span className="text-sm text-muted-foreground">
                  {t.billing.pricing.period[interval]}
                </span>
              )}
            </div>
            {hasPromotion && originalPrice !== null && (
              <p className="mt-2 text-lg font-medium text-[#6b63dc] line-through decoration-2 decoration-[#6b63dc]">
                ${Math.round(originalPrice / 100)}
              </p>
            )}

            <div className="mt-8">
              {isCurrent ? (
                <div className="flex h-12 items-center justify-center rounded-xl border border-border/55 bg-background/35 text-sm font-medium text-foreground/80">
                  {t.billing.pricing.currentPlan}
                </div>
              ) : price === 0 ? (
                <div className="flex h-12 items-center justify-center rounded-xl border border-border/55 bg-background/35 text-sm font-medium text-muted-foreground">
                  {t.billing.pricing.freeForever}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectPlan?.(plan.id)}
                  disabled={!!subscribingPlan || price === null}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#417bea,#7954e8)] text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(79,103,234,0.95)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubscribing ? <Loader2 className="size-4 animate-spin" /> : <>{t.billing.pricing.upgradeToPro}<ArrowUpRight className="size-3.5" /></>}
                </button>
              )}
            </div>

            <p className={`mt-9 text-xs font-medium ${isPro ? "text-[#6670e9]" : "text-muted-foreground"}`}>
              {copy.includedTitle}
            </p>
            <ul className="mt-5 space-y-4">
              {copy.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-[13px] text-foreground/80">
                  <Check className={`mt-0.5 size-3.5 shrink-0 ${isPro ? "text-[#6170ea]" : "text-muted-foreground"}`} strokeWidth={2} />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
};
