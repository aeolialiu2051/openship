"use client";

/**
 * Settings — tabbed layout with left sidebar (desktop) + horizontal
 * scroll tabs (mobile). Mirrors the project-detail page pattern.
 *
 * Tabs:
 *   - general   → GitHub connection, deploy defaults, build preferences
 *   - tokens    → clone credentials, API access tokens
 *   - mcp        → MCP connection (endpoint + client config)
 *   - team      → organization members + invitations (moved from /members)
 *   - audit     → audit log feed (moved from /audit), admin+ only
 *   - cloud     → cloud connection (self-hosted only)
 *   - instance  → instance info + data export/import (self-hosted, owner-gated)
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { usePlatform } from "@/context/PlatformContext";
import { useCloud } from "@/context/CloudContext";
import { useToast } from "@/context/ToastContext";
import { useI18n } from "@/components/i18n-provider";

import {
  SettingsSidebar,
  SettingsMobileTabs,
  useSettingsTabs,
  type SettingsTabId,
} from "./_components/SettingsSidebar";
import { PageContainer } from "@/components/ui/PageContainer";

function SettingsPanelSkeleton() {
  return (
    <div className="space-y-4 rounded-2xl border border-border/50 bg-card p-6" aria-busy="true">
      <div className="h-5 w-40 animate-pulse rounded bg-muted" />
      <div className="h-4 w-72 max-w-full animate-pulse rounded bg-muted/60" />
      <div className="h-24 animate-pulse rounded-xl bg-muted/40" />
    </div>
  );
}

const lazySettingsComponent = (
  loader: () => Promise<any>,
  exportName: string,
) => dynamic<any>(() => loader().then((mod) => mod[exportName]), { loading: SettingsPanelSkeleton });

const BuildPreferences = lazySettingsComponent(() => import("./_components/BuildPreferences"), "BuildPreferences");
const DeployDefaults = lazySettingsComponent(() => import("./_components/DeployDefaults"), "DeployDefaults");
const CloudConnection = lazySettingsComponent(() => import("./_components/CloudConnection"), "CloudConnection");
const GitHubConnection = lazySettingsComponent(() => import("./_components/GitHubConnection"), "GitHubConnection");
const CloneCredentials = lazySettingsComponent(() => import("./_components/CloneCredentials"), "CloneCredentials");
const PersonalAccessTokens = lazySettingsComponent(() => import("./_components/PersonalAccessTokens"), "PersonalAccessTokens");
const McpConnection = lazySettingsComponent(() => import("./_components/McpConnection"), "McpConnection");
const InstanceInfo = lazySettingsComponent(() => import("./_components/InstanceInfo"), "InstanceInfo");
const LanguageSetting = lazySettingsComponent(() => import("./_components/LanguageSetting"), "LanguageSetting");
const AccountSecurity = lazySettingsComponent(() => import("./_components/AccountSecurity"), "AccountSecurity");
const UpdatesTab = lazySettingsComponent(() => import("./_components/UpdatesTab"), "UpdatesTab");
const TeamTab = lazySettingsComponent(() => import("./_components/TeamTab"), "TeamTab");
const NotificationsTab = lazySettingsComponent(() => import("./_components/NotificationsTab"), "NotificationsTab");
const EmailSettings = lazySettingsComponent(() => import("./_components/EmailSettings"), "EmailSettings");
const AuditTab = lazySettingsComponent(() => import("./_components/AuditTab"), "AuditTab");
const DataTransferTab = lazySettingsComponent(() => import("./_components/DataTransferTab"), "DataTransferTab");

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </PageContainer>
      }
    >
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const { selfHosted, userServers, deployMode } = usePlatform();
  const { refresh } = useCloud();
  const { showToast } = useToast();
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const { activeTab } = useSettingsTabs();
  const [visitedTabs, setVisitedTabs] = useState<Set<SettingsTabId>>(
    () => new Set([activeTab]),
  );

  useEffect(() => {
    setVisitedTabs((current) => {
      if (current.has(activeTab)) return current;
      const next = new Set(current);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);
  const renderedTabs = visitedTabs.has(activeTab)
    ? visitedTabs
    : new Set(visitedTabs).add(activeTab);

  // Build preferences: only self-hosted — SaaS manages builds.
  const showBuildPreferences = selfHosted;
  // Deploy defaults are also meaningful on local SaaS, where the picker can
  // target either managed cloud or a user-owned VPS.
  const showDeployDefaults = selfHosted || userServers;

  /* ── Cloud callback (redirect after connect) ── */
  useEffect(() => {
    if (searchParams.get("cloud") === "connected") {
      refresh();
      showToast(t.settings.page.cloudConnectedToast, "success", t.settings.common.toast.cloud);
      window.history.replaceState({}, "", "/settings?tab=cloud");
    }
  }, [searchParams, showToast, refresh, t]);

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl font-medium text-foreground/80" style={{ letterSpacing: "-0.2px" }}>
          {t.settings.page.title}
        </h1>
        <p className="text-sm text-muted-foreground/70 mt-1">{t.settings.page.subtitle}</p>
      </div>

      <SettingsMobileTabs />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 mt-4 lg:mt-0">
        {/* ── ACTIVE TAB CONTENT (left, primary) ── */}
        <div className="space-y-6 min-w-0">
          {renderedTabs.has("general") && (
            <div className={activeTab === "general" ? "contents" : "hidden"}>
              <GitHubConnection />
              {showDeployDefaults && <DeployDefaults />}
              {showBuildPreferences && <BuildPreferences />}
              <LanguageSetting />
            </div>
          )}

          {renderedTabs.has("account") && (
            <div className={activeTab === "account" ? "contents" : "hidden"}><AccountSecurity /></div>
          )}

          {renderedTabs.has("tokens") && (
            <div className={activeTab === "tokens" ? "contents" : "hidden"}>
              <CloneCredentials />
              <PersonalAccessTokens />
            </div>
          )}

          {renderedTabs.has("mcp") && (
            <div className={activeTab === "mcp" ? "contents" : "hidden"}><McpConnection /></div>
          )}

          {renderedTabs.has("team") && (
            <div className={activeTab === "team" ? "contents" : "hidden"}><TeamTab /></div>
          )}

          {renderedTabs.has("notifications") && (
            <div className={activeTab === "notifications" ? "contents" : "hidden"}><NotificationsTab /></div>
          )}

          {renderedTabs.has("email") && selfHosted && (
            <div className={activeTab === "email" ? "contents" : "hidden"}><EmailSettings /></div>
          )}

          {renderedTabs.has("audit") && (
            <div className={activeTab === "audit" ? "contents" : "hidden"}><AuditTab /></div>
          )}

          {renderedTabs.has("cloud") && selfHosted && (
            <div className={activeTab === "cloud" ? "contents" : "hidden"}><CloudConnection /></div>
          )}

          {renderedTabs.has("instance") && (
            <div className={activeTab === "instance" ? "contents" : "hidden"}>
              <InstanceInfo />
              {/* Updates live under Instance (the "this install" home). Not on
                  the SaaS — the managed cloud has nothing for the user to update. */}
              {(selfHosted || deployMode === "desktop") && <UpdatesTab />}
              {/* Full-DB export/import (owner-gated inside the component);
                  self-hosted only — SaaS has no portable DB. */}
              {selfHosted && <DataTransferTab />}
            </div>
          )}
        </div>

        {/* ── NAV (right, sticky on desktop) ── */}
        <aside className="hidden lg:block lg:sticky lg:top-6 lg:self-start">
          <SettingsSidebar />
        </aside>
      </div>
    </PageContainer>
  );
}
