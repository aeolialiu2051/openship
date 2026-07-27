"use client";

import React, { useEffect, useMemo } from "react";
import { Cloud, Cpu } from "lucide-react";
import {
  OptionCard,
  lastPickStore,
} from "@/app/(dashboard)/(deployment)/deploy/[slug]/components/DeployTargetStep";
import ServerSelector, { type ServerOption } from "@/components/shared/ServerSelector";
import type { DeployTarget } from "@/context/deployment/types";
import { useI18n } from "@/components/i18n-provider";
import { usePlatform } from "@/context/PlatformContext";
import {
  APP_CLOUD_INSTALL_AVAILABLE,
  canUseLocalAppDestination,
} from "./app-destination-availability";

export interface AppDestination {
  deployTarget: DeployTarget;
  serverId?: string;
  /** Host of the selected server (sshHost) — lets the app wizard build a
   *  reachable `http://host:port` URL for a port-only (no-domain) install. */
  serverHost?: string;
}

/**
 * "Where to install" picker for the app wizards. Servers use the shared
 * mail-style `ServerSelector` dropdown (pre-selects the first/only server so the
 * wizard opens with a destination already chosen; collapses many into a
 * searchable list, carries its own "add server"), with Openship Cloud /
 * this-machine as sibling choices. Reports the pick as
 * `{deployTarget, serverId, serverHost}`.
 */
export function AppDestinationPicker({
  value,
  onChange,
  allowLocal = false,
}: {
  value: AppDestination | null;
  onChange: (d: AppDestination | null) => void;
  allowLocal?: boolean;
}) {
  const { t } = useI18n();
  const w = t.projectSettings.appInstall;
  const opt = t.deploy.targetStep.options;
  const { deployMode, userServers } = usePlatform();
  const remembered = useMemo(() => lastPickStore.read(), []);
  const localAvailable = canUseLocalAppDestination({ allowLocal, deployMode });
  const hasUsableRememberedTarget =
    (remembered?.target === "server" && userServers) ||
    (remembered?.target === "local" && localAvailable) ||
    remembered?.target === "cloud";

  const pick = (destination: AppDestination) => {
    onChange(destination);
    lastPickStore.write({
      target: destination.deployTarget,
      serverId: destination.serverId ?? null,
    });
  };

  useEffect(() => {
    if (value?.deployTarget === "local" && !localAvailable) {
      onChange(null);
      return;
    }
    if (value) return;
    if (remembered?.target === "server" && remembered.serverId && userServers) {
      pick({ deployTarget: "server", serverId: remembered.serverId });
    } else if (remembered?.target === "local" && localAvailable) {
      pick({ deployTarget: "local" });
    } else if (remembered?.target === "cloud" || !userServers) {
      pick({ deployTarget: "cloud" });
    }
    // Seed once from persisted browser state; subsequent changes are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const serverActive = value?.deployTarget === "server";

  return (
    <div className="space-y-2">
      {/* Servers — mail-style dropdown. Ring shows when it's the active target
          (the selector only highlights a server while server is chosen). */}
      {userServers && (
        <div
          className={`rounded-xl transition-shadow ${serverActive ? "ring-2 ring-primary/40" : ""}`}
        >
          <ServerSelector
            compact
            autoSelectFirst={!hasUsableRememberedTarget}
            value={serverActive ? (value?.serverId ?? null) : null}
            onSelect={(s: ServerOption | null) => {
              if (s) pick({ deployTarget: "server", serverId: s.id, serverHost: s.host });
              else if (serverActive) {
                lastPickStore.clear();
                onChange(null);
              }
            }}
          />
        </div>
      )}

      <OptionCard
        value="cloud"
        selected={value?.deployTarget === "cloud"}
        onSelect={() => pick({ deployTarget: "cloud" })}
        badge={!APP_CLOUD_INSTALL_AVAILABLE ? t.deploy.targetStep.comingSoon : undefined}
        icon={<Cloud className="size-4" />}
        label={opt.cloud}
        description={opt.cloudConnectedDesc}
      />

      {localAvailable && (
        <OptionCard
          value="local"
          selected={value?.deployTarget === "local"}
          onSelect={() => pick({ deployTarget: "local" })}
          icon={<Cpu className="size-4" />}
          label={w.destLocal}
          description={w.destLocalDesc}
        />
      )}
    </div>
  );
}
