"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Zap } from "lucide-react";

import { useGitHub } from "@/context/GitHubContext";
import { usePlatform } from "@/context/PlatformContext";
import { useI18n } from "@/components/i18n-provider";
import { githubApi } from "@/lib/api";
import { isProductTipAvailable, PRODUCT_TIPS } from "./home-tips";

interface HomeTipCardProps {
  projectCount: number;
  loading: boolean;
}

interface HomeTip {
  text: string;
  href: string;
  label: string;
}

export default function HomeTipCard({ projectCount, loading }: HomeTipCardProps) {
  const gitHub = useGitHub();
  const { selfHosted, userServers } = usePlatform();
  const { t } = useI18n();
  const c = t.overview.homeTip;

  // `/github/home` is intentionally gh-first and may skip the cloud round-trip
  // that verifies a GitHub App installation. If it cannot already prove a
  // connection, use the canonical status endpoint before showing a connect CTA.
  const [appConnection, setAppConnection] = useState<boolean | null>(
    gitHub.connected ? true : null,
  );
  useEffect(() => {
    if (gitHub.connected) {
      setAppConnection(true);
      return;
    }

    let cancelled = false;
    setAppConnection(null);
    githubApi
      .getStatusDeduped<{ state?: { sources?: { vibrailApp?: { connected?: boolean } } } }>()
      .then((response) => {
        if (!cancelled) {
          setAppConnection(Boolean(response?.state?.sources?.vibrailApp?.connected));
        }
      })
      .catch(() => {
        // A failed probe is not evidence that the user disconnected. Keep the
        // neutral product tip instead of presenting a misleading connect CTA.
        if (!cancelled) setAppConnection(null);
      });
    return () => {
      cancelled = true;
    };
  }, [gitHub.connected]);

  // A contextual onboarding nudge always wins over the random product tip:
  // connect GitHub if disconnected, else create the first project.
  const busy = loading || gitHub.loading || appConnection === null;
  const githubConnected = gitHub.connected || appConnection === true;
  const contextual: HomeTip | null = !busy && !githubConnected
    ? { text: c.connectText, href: "/settings", label: c.connectLabel }
    : !busy && projectCount === 0
      ? { text: c.createText, href: "/new", label: c.createLabel }
      : null;

  // Otherwise rotate through the product tips — a fresh one per mount (per
  // visit). Only tips whose route exists on this install. Index 0 on SSR /
  // first render (deterministic → no hydration mismatch), randomized on mount.
  const pool = useMemo(
    () => PRODUCT_TIPS.filter((tip) => isProductTipAvailable(tip, { selfHosted, userServers })),
    [selfHosted, userServers],
  );
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (pool.length > 1) setIdx(Math.floor(Math.random() * pool.length));
  }, [pool.length]);

  // Contextual nudge wins; otherwise resolve the picked product tip's copy from
  // i18n (overview.homeTip.tips.<id>).
  const tipCopy = c.tips as Record<string, { text: string; label: string }> | undefined;
  let tip = contextual;
  if (!tip) {
    const pick = pool[idx] ?? pool[0];
    const copy = pick ? tipCopy?.[pick.id] : undefined;
    if (pick && copy) tip = { text: copy.text, href: pick.href, label: copy.label };
  }
  // Some locales intentionally lag behind the rotating product-tip catalog.
  // Keep the card localized instead of rendering missing keys (or throwing)
  // by falling back to the long-standing settings tip available in every locale.
  if (!tip) {
    tip = { text: c.settingsText, href: "/projects", label: c.settingsLabel };
  }
  if (busy) {
    return (
      <div className="rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/5 via-primary/3 to-transparent p-5" aria-busy="true">
        <div className="mb-4 flex items-center gap-2">
          <div className="size-4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-2">
          <div className="h-3.5 w-full animate-pulse rounded bg-muted/70" />
          <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted/70" />
        </div>
        <div className="mt-4 h-4 w-24 animate-pulse rounded bg-muted" />
      </div>
    );
  }
  if (!tip) return null;

  return (
    <div className="bg-gradient-to-br from-primary/5 via-primary/3 to-transparent rounded-2xl border border-primary/10 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="size-4 text-primary" />
        <h3 className="font-semibold text-foreground text-sm">{c.quickTip}</h3>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{tip.text}</p>
      <Link
        href={tip.href}
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 mt-3 transition-colors"
      >
        {tip.label}
        <ArrowRight className="size-3.5 rtl:rotate-180" />
      </Link>
    </div>
  );
}
