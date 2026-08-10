"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CLOUD_DASHBOARD_URL, CLOUD_API_URL } from "@repo/core/runtime-config";

/** Default deployment domain - matches SYSTEM.DOMAINS.CLOUD_DOMAIN in @repo/core. */
const DEFAULT_MANAGED_DOMAIN = "vibrail.app";

/* ── Types ────────────────────────────────────────────────────────── */

interface PlatformContextValue {
  selfHosted: boolean;
  userServers: boolean;
  deployMode: string;
  /** Vibrail runs ON a server (self-hosted, non-desktop): the host is itself a
   *  deployable target, auto-registered as the isLocal "This Server". */
  isServerHost: boolean;
  authMode: "cloud" | "local" | "none";
  version?: string;
  cloudAuthUrl: string;
  cloudApiUrl: string;
  machineName?: string;
  siteDomain: string;
  managedDomain: string;
  managedDomainNeedsCloud: boolean;
  /** Resolved deployment base domain. */
  baseDomain: string;
  setSelfHosted: (v: boolean) => void;
}

const PlatformContext = createContext<PlatformContextValue | undefined>(undefined);

type CloudConnectionPlatformState = Pick<PlatformContextValue, "selfHosted" | "deployMode">;

export function canUseCloudConnection({
  selfHosted,
  deployMode,
}: CloudConnectionPlatformState) {
  return selfHosted || deployMode === "desktop";
}

/** Whether this dashboard should expose the build/deploy target picker.
 * Local SaaS is cloud-hosted but may still orchestrate user-owned VPS targets,
 * so this follows the explicit capability instead of `selfHosted`. */
export function canChooseDeployTarget({
  deployMode,
  userServers,
}: Pick<PlatformContextValue, "deployMode" | "userServers">) {
  return deployMode === "desktop" || userServers;
}

export function usePlatform() {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error("usePlatform must be used within PlatformProvider");
  return ctx;
}

/* ── Provider ─────────────────────────────────────────────────────── */

interface PlatformProviderProps {
  children: React.ReactNode;
  selfHosted?: boolean;
  userServers?: boolean;
  deployMode?: string;
  isServerHost?: boolean;
  authMode?: "cloud" | "local" | "none";
  version?: string;
  cloudAuthUrl?: string;
  cloudApiUrl?: string;
  machineName?: string;
  siteDomain?: string;
  managedDomain?: string;
  managedDomainNeedsCloud?: boolean;
}

/**
 * Drives the platform context off SSR-passed props directly — only the
 * mutable `selfHosted` toggle (used by the onboarding flow) needs
 * local state. Previously every prop was frozen via `useState` at
 * first mount, so a stale `cloudAuthUrl` from a one-off bad SSR latched
 * for the SPA's lifetime. Now a fresh SSR (e.g. after the
 * `_deploymentInfo` cache TTLs) always wins.
 */
export function PlatformProvider({
  children,
  selfHosted: initialSelfHosted = true,
  userServers = initialSelfHosted,
  deployMode = "docker",
  isServerHost = false,
  authMode = "local",
  version,
  cloudAuthUrl = CLOUD_DASHBOARD_URL,
  cloudApiUrl = CLOUD_API_URL,
  machineName,
  siteDomain = "vibrail.com",
  managedDomain = DEFAULT_MANAGED_DOMAIN,
  managedDomainNeedsCloud = true,
}: PlatformProviderProps) {
  const [selfHosted, setSelfHostedState] = useState(initialSelfHosted);
  const baseDomain = managedDomain;
  const setSelfHosted = useCallback((v: boolean) => setSelfHostedState(v), []);

  return (
    <PlatformContext.Provider
      value={{
        selfHosted,
        userServers,
        deployMode,
        isServerHost,
        authMode,
        version,
        cloudAuthUrl,
        cloudApiUrl,
        machineName,
        siteDomain,
        managedDomain,
        managedDomainNeedsCloud,
        baseDomain,
        setSelfHosted,
      }}
    >
      {children}
    </PlatformContext.Provider>
  );
}
