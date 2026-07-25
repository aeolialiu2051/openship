"use client";

/**
 * Top-level mail admin panel - shown on /emails once the server is fully
 * provisioned. Tab state lives in the URL so refreshes and back/forward
 * navigation preserve context.
 *
 * Tab bar: chunky horizontal nav with icon-above-label. Each tab gets a
 * proper hit area + clear active state so the admin reads as a flagship
 * surface, not a settings page. Built on a sticky <nav> with a single
 * bottom border, like Vercel's project header tabs.
 *
 * Tabs:
 *   - Overview:   credentials + setup-guide banners + webmail.
 *   - Domains:    vmail.domain CRUD.
 *   - Mailboxes:  vmail.mailbox CRUD per domain.
 *   - DNS:        reference of DNS records.
 *   - Components: live daemon health (separated from Overview by request).
 *   - Advanced:   destructive / power-user actions.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Globe,
  UserRound,
  FileText,
  HeartPulse,
  Send,
  Settings,
  DatabaseBackup,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import type { MailSetupStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";
import { OverviewTab } from "./overview-tab";

// Keep the overview in the route's initial bundle and load the heavier,
// lower-frequency admin surfaces only when their tab (or UI state) is used.
// A shared, height-stable placeholder prevents the content area from jumping
// while a tab chunk is fetched on first visit.
const DomainsTab = dynamic(
  () => import("./domains-tab").then((module) => module.DomainsTab),
  { loading: AdminTabLoading },
);
const MailboxesTab = dynamic(
  () => import("./mailboxes-tab").then((module) => module.MailboxesTab),
  { loading: AdminTabLoading },
);
const DnsTab = dynamic(
  () => import("./dns-tab").then((module) => module.DnsTab),
  { loading: AdminTabLoading },
);
const HealthTab = dynamic(
  () => import("./health-tab").then((module) => module.HealthTab),
  { loading: AdminTabLoading },
);
const TestTab = dynamic(
  () => import("./test-tab").then((module) => module.TestTab),
  { loading: AdminTabLoading },
);
const BackupTab = dynamic(
  () => import("./backup-tab").then((module) => module.BackupTab),
  { loading: AdminTabLoading },
);
const SendingTab = dynamic(
  () => import("./sending-tab").then((module) => module.SendingTab),
  { loading: AdminTabLoading },
);
const AdvancedTab = dynamic(
  () => import("./advanced-tab").then((module) => module.AdvancedTab),
  { loading: AdminTabLoading },
);
const WelcomeModal = dynamic(
  () => import("./welcome-modal").then((module) => module.WelcomeModal),
  { loading: WelcomeModalLoading },
);
const ReputationBanner = dynamic(
  () => import("./reputation-banner").then((module) => module.ReputationBanner),
  { loading: ReputationBannerLoading },
);

const WELCOME_SEEN_PREFIX = "openship:mail:welcome-seen:";

interface MailAdminPanelProps {
  status: MailSetupStatus;
  serverId: string;
  onRefresh: () => void;
  /** Called after the server is removed from the mail registry (DB-only). */
  onForgotten: () => void;
}

type TabKey =
  | "overview"
  | "domains"
  | "mailboxes"
  | "dns"
  | "health"
  | "test"
  | "backup"
  | "sending"
  | "advanced";

interface TabDef {
  key: TabKey;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { key: "overview", icon: LayoutDashboard },
  { key: "domains", icon: Globe },
  { key: "mailboxes", icon: UserRound },
  { key: "dns", icon: FileText },
  { key: "health", icon: HeartPulse },
  { key: "test", icon: Send },
  { key: "backup", icon: DatabaseBackup },
  { key: "sending", icon: Waypoints },
  { key: "advanced", icon: Settings },
];

const VALID_TABS: TabKey[] = TABS.map((t) => t.key);

function AdminTabLoading() {
  return (
    <div
      aria-hidden
      className="min-h-[360px] rounded-2xl border border-border/60 bg-card p-5"
    >
      <div className="animate-pulse space-y-5">
        <div className="space-y-2">
          <div className="h-5 w-36 rounded bg-muted" />
          <div className="h-3.5 w-64 max-w-full rounded bg-muted/70" />
        </div>
        <div className="h-10 w-full rounded-lg bg-muted/70" />
        <div className="space-y-3 pt-1">
          <div className="h-12 w-full rounded-lg bg-muted/60" />
          <div className="h-12 w-full rounded-lg bg-muted/60" />
          <div className="h-12 w-full rounded-lg bg-muted/60" />
        </div>
      </div>
    </div>
  );
}

function ReputationBannerLoading() {
  return (
    <div
      aria-hidden
      className="h-[90px] animate-pulse rounded-2xl border border-border/50 bg-muted/35"
    />
  );
}

function WelcomeModalLoading() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4"
    >
      <div className="h-[280px] w-full max-w-[460px] animate-pulse rounded-2xl border border-border bg-card shadow-xl">
        <div className="space-y-3 px-7 pb-6 pt-8">
          <div className="h-7 w-64 max-w-full rounded bg-muted" />
          <div className="h-4 w-52 max-w-full rounded bg-muted/70" />
        </div>
        <div className="h-px bg-border" />
        <div className="space-y-3 px-7 py-6">
          <div className="h-4 w-28 rounded bg-muted/70" />
          <div className="h-10 w-full rounded-lg bg-muted/70" />
        </div>
      </div>
    </div>
  );
}

export function MailAdminPanel({ status, serverId, onRefresh, onForgotten }: MailAdminPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const primaryDomain = status.domain ?? "";
  const [showWelcome, setShowWelcome] = useState(false);

  // One-shot welcome modal: first time the admin panel mounts for this
  // serverId, show the celebratory test-email modal. The flag is keyed by
  // serverId so each new mail server gets its own welcome moment.
  useEffect(() => {
    if (!serverId || typeof window === "undefined") return;
    const key = `${WELCOME_SEEN_PREFIX}${serverId}`;
    if (window.localStorage.getItem(key)) return;
    setShowWelcome(true);
  }, [serverId]);

  const dismissWelcome = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`${WELCOME_SEEN_PREFIX}${serverId}`, "1");
    }
    setShowWelcome(false);
  }, [serverId]);

  const tab = useMemo<TabKey>(() => {
    const raw = searchParams.get("tab") as TabKey | null;
    if (raw && VALID_TABS.includes(raw)) return raw;
    return "overview";
  }, [searchParams]);

  const selectedDomain = searchParams.get("domain") || primaryDomain;

  const setQuery = useCallback(
    (patch: { tab?: TabKey; domain?: string | null }) => {
      const next = new URLSearchParams(searchParams.toString());
      if (patch.tab !== undefined) next.set("tab", patch.tab);
      if (patch.domain !== undefined) {
        if (patch.domain) next.set("domain", patch.domain);
        else next.delete("domain");
      }
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <div className="space-y-6">
      {primaryDomain && (
        <ReputationBanner serverId={serverId} domain={primaryDomain} />
      )}

      <TabBar
        tabs={TABS}
        active={tab}
        onChange={(k) => setQuery({ tab: k })}
      />

      <div>
        {tab === "overview" && (
          <OverviewTab status={status} serverId={serverId} onRefresh={onRefresh} />
        )}
        {tab === "domains" && (
          <DomainsTab
            serverId={serverId}
            primaryDomain={primaryDomain}
            onDomainDeleted={(deleted) => {
              // If the URL's `?domain=` matched the just-deleted domain,
              // strip it so subsequent navigation to the Mailboxes tab
              // doesn't try to fetch from a domain that's gone.
              if (searchParams.get("domain") === deleted) {
                setQuery({ domain: null });
              }
            }}
          />
        )}
        {tab === "mailboxes" && (
          <MailboxesTab
            serverId={serverId}
            primaryDomain={primaryDomain}
            selectedDomain={selectedDomain}
            onSelectDomain={(d) => setQuery({ domain: d })}
          />
        )}
        {tab === "dns" && (
          <DnsTab
            status={status}
            serverId={serverId}
            primaryDomain={primaryDomain}
            selectedDomain={selectedDomain}
            onSelectDomain={(d) => setQuery({ domain: d })}
          />
        )}
        {tab === "health" && <HealthTab serverId={serverId} />}
        {tab === "test" && <TestTab serverId={serverId} />}
        {tab === "backup" && <BackupTab serverId={serverId} domain={primaryDomain} />}
        {tab === "sending" && <SendingTab serverId={serverId} primaryDomain={primaryDomain} />}
        {tab === "advanced" && (
          <AdvancedTab
            status={status}
            serverId={serverId}
            onChanged={onRefresh}
            onForgotten={onForgotten}
          />
        )}
      </div>

      {showWelcome && primaryDomain && (
        <WelcomeModal
          serverId={serverId}
          domain={primaryDomain}
          onClose={dismissWelcome}
        />
      )}
    </div>
  );
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

/**
 * Tab bar - matches the pattern used on the server-detail page
 * (servers/[serverId]/page.tsx): horizontal flex with icon-left-of-label,
 * thin bottom-border on the bar, primary-coloured underline indicator
 * sitting under the active tab. Scrolls horizontally on narrow screens.
 */
function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: TabKey;
  onChange: (key: TabKey) => void;
}) {
  const { t } = useI18n();
  return (
    <nav
      className="flex items-center gap-1 border-b border-border/50 overflow-x-auto"
      aria-label={t.emailsAdmin.panel.ariaLabel}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground/70",
            )}
          >
            <Icon className="size-4" strokeWidth={2} />
            {t.emailsAdmin.panel.tabs[tab.key]}
            {isActive && (
              <span className="absolute bottom-0 start-0 end-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
