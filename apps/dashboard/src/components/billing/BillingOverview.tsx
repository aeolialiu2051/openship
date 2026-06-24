"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, Sparkles } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { PLANS } from "@repo/core";
import { api } from "@/lib/api/client";
import type { BillingState } from "@/lib/api/billing";

export type { BillingState };

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/**
 * Legacy compatibility — older callers (and the mock data layer) still
 * import `BillingData`. The two shapes diverged when we switched to the
 * credits model; keep the alias so the file's named exports stay stable
 * while the rest of the dashboard migrates.
 */
export type BillingData = BillingState;

interface BillingOverviewProps {
  state: BillingState;
}

interface UsageBucket {
  timestamp: string;
  credits: number;
}

interface UsageResponse {
  data: {
    from: string;
    to: string;
    groupBy: "hour" | "day";
    usage: { buckets: UsageBucket[] } | null;
  };
}

interface TopupPack {
  id: string;
  name: string;
  credits_milli: number;
  price_cents: number;
  stripePriceId: string;
  sortOrder: number;
}

interface TopupPacksResponse {
  data: TopupPack[];
}

interface TopupCheckoutResponse {
  data: { checkoutUrl: string };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatCredits(milliCredits: number): string {
  const credits = Math.floor(milliCredits / 1000);
  return credits.toLocaleString();
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function pctUsed(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.max(0, (used / limit) * 100));
}

function ringStrokeClass(pct: number): string {
  if (pct >= 90) return "text-red-500";
  if (pct >= 75) return "text-amber-500";
  return "text-primary";
}

function daysUntil(end: Date | string | null): number | null {
  if (!end) return null;
  const endMs = typeof end === "string" ? Date.parse(end) : end.getTime();
  if (Number.isNaN(endMs)) return null;
  const diff = endMs - Date.now();
  if (diff <= 0) return null;
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function statusPillClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "active") return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
  if (s === "past_due" || s === "unpaid") return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
  if (s === "canceled" || s === "cancelled") return "bg-muted text-muted-foreground border-border";
  return "bg-muted text-muted-foreground border-border";
}

/* ------------------------------------------------------------------ */
/*  Ring gauge                                                        */
/* ------------------------------------------------------------------ */

/**
 * Circular usage indicator. Built with SVG so it scales cleanly and
 * doesn't pull in a chart library for one shape. Stroke color comes
 * from the parent via `currentColor`; pass the right text-color class
 * (text-primary / text-amber-500 / text-red-500) based on threshold.
 */
function RingGauge({
  pct,
  size = 168,
  stroke = 14,
  children,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-muted"
          strokeWidth={stroke}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Upgrade button (kept exported — used elsewhere)                   */
/* ------------------------------------------------------------------ */

export function UpgradeButton({ children, onClick, className = "" }: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-primary-foreground transition-all ${className}`}
    >
      <span className="pointer-events-none absolute -inset-[1px] rounded-xl bg-gradient-to-r from-primary via-blue-500 to-violet-500 opacity-40 blur-[1px] transition-opacity group-hover:opacity-60" />
      <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary to-primary/90" />
      <span className="relative flex items-center gap-1.5">{children}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero — ring on left, plan summary on right                        */
/* ------------------------------------------------------------------ */

function BalanceHero({ state }: { state: BillingState }) {
  const { quotaLimit, quotaUsed, quotaRemaining } = state.balance;
  const pct = pctUsed(quotaUsed, quotaLimit);
  const days = daysUntil(state.currentPeriod.end);
  const plan = PLANS[state.tier];
  const planName = plan?.name ?? state.tier;
  const ringTone = ringStrokeClass(pct);

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6">
      <div className="flex flex-col items-center gap-7 sm:flex-row sm:items-center sm:gap-8">
        {/* Ring */}
        <div className={ringTone}>
          <RingGauge pct={pct}>
            <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
              {formatCredits(quotaRemaining)}
            </span>
            <span className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              credits left
            </span>
          </RingGauge>
        </div>

        {/* Summary */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">{planName} plan</h2>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${statusPillClass(state.status)}`}
            >
              {state.status.replace(/_/g, " ")}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:max-w-md">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Used this period
              </p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                {formatCredits(quotaUsed)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  / {formatCredits(quotaLimit)}
                </span>
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Resets
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {days !== null
                  ? `In ${days} day${days === 1 ? "" : "s"}`
                  : "—"}
              </p>
            </div>
          </div>

          {state.tier === "free" && (
            <Link
              href="/billing/plans"
              className="relative inline-flex w-fit items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              <span className="pointer-events-none absolute -inset-[1px] rounded-xl bg-gradient-to-r from-primary via-blue-500 to-violet-500 opacity-40 blur-[1px] transition-opacity hover:opacity-60" />
              <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary to-primary/90" />
              <span className="relative flex items-center gap-1.5">
                <Sparkles className="size-3.5" />
                Upgrade to Pro
              </span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Recent-activity sparkline                                          */
/* ------------------------------------------------------------------ */

function RecentActivityCard() {
  const [buckets, setBuckets] = useState<UsageBucket[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const to = new Date();
        const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
        const qs = new URLSearchParams({
          from: from.toISOString(),
          to: to.toISOString(),
          groupBy: "day",
        });
        const res = await api.get<UsageResponse>(`billing/usage?${qs.toString()}`);
        if (cancelled) return;
        setBuckets(res.data.usage?.buckets ?? []);
      } catch {
        if (!cancelled) setError("Failed to load usage");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const data = (buckets ?? []).map((b) => ({
    timestamp: b.timestamp,
    credits: Math.max(0, b.credits / 1000),
  }));

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Recent activity</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Last 7 days</p>
        </div>
        <Link
          href="/billing/usage"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          View full usage
          <ArrowUpRight className="size-3" />
        </Link>
      </div>

      <div className="h-20">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {error}
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No usage yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="credits"
                stroke="hsl(var(--primary))"
                strokeWidth={1.75}
                fill="url(#sparkFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick-buy credit packs                                            */
/* ------------------------------------------------------------------ */

function BuyCreditsCard() {
  const [packs, setPacks] = useState<TopupPack[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buyingPackId, setBuyingPackId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api.get<TopupPacksResponse>("billing/topup-packs");
        if (cancelled) return;
        const sorted = [...res.data].sort((a, b) => a.sortOrder - b.sortOrder);
        setPacks(sorted.slice(0, 2));
      } catch {
        if (!cancelled) setError("Failed to load packs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleBuy(packId: string) {
    setBuyingPackId(packId);
    try {
      const res = await api.post<TopupCheckoutResponse>("billing/topup", { packId });
      window.location.href = res.data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
      setBuyingPackId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Need more credits?</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            One-time top-ups, no subscription change
          </p>
        </div>
        <Link
          href="/billing/topups"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          See all packs
          <ArrowUpRight className="size-3" />
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="py-4 text-xs text-muted-foreground">{error}</p>
      ) : !packs || packs.length === 0 ? (
        <p className="py-4 text-xs text-muted-foreground">No top-up packs available.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {packs.map((pack) => {
            const isBuying = buyingPackId === pack.id;
            return (
              <button
                key={pack.id}
                onClick={() => handleBuy(pack.id)}
                disabled={buyingPackId !== null}
                className="group flex items-center justify-between rounded-xl border border-border/60 bg-background/40 px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {formatCredits(pack.credits_milli)} credits
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDollars(pack.price_cents)} one-time
                  </p>
                </div>
                <span className="ml-3 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
                  {isBuying ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <>
                      Buy
                      <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export const BillingOverview: React.FC<BillingOverviewProps> = ({ state }) => {
  return (
    <div className="flex flex-col gap-5">
      <BalanceHero state={state} />
      <RecentActivityCard />
      <BuyCreditsCard />
    </div>
  );
};
