"use client";

import { useEffect } from "react";
import { Server, Cloud, Plus } from "lucide-react";
import {
  OptionCard,
  ServerPicker,
  useDeployTargets,
  lastPickStore,
} from "@/app/(dashboard)/(deployment)/deploy/[slug]/components/DeployTargetStep";
import { AddServerModal } from "@/app/(dashboard)/(deployment)/deploy/[slug]/components/AddServerModal";
import { interpolate, useI18n } from "@/components/i18n-provider";
import { useModal } from "@/context/ModalContext";

export interface AppDestination {
  deployTarget: "server" | "cloud";
  serverId?: string;
}

/**
 * "Where to install" picker for the app wizards — the SAME target selection as
 * the deploy wizard, assembled from its shared primitives (useDeployTargets +
 * OptionCard + lastPickStore + AddServerModal) with zero logic duplication.
 * Reports the pick as {deployTarget, serverId} and remembers the last choice.
 */
export function AppDestinationPicker({
  value,
  onChange,
}: {
  value: AppDestination | null;
  onChange: (d: AppDestination) => void;
}) {
  const targets = useDeployTargets();
  const { t } = useI18n();
  const { showModal, hideModal } = useModal();
  const opt = t.deploy.targetStep.options;
  const hasServers = targets.servers.length > 0;
  const isSingleServer = targets.servers.length === 1;

  const pick = (d: AppDestination) => {
    onChange(d);
    lastPickStore.write({ target: d.deployTarget, serverId: d.serverId ?? null });
  };

  const openAddServer = () => {
    const modalId = showModal({
      width: "720px",
      maxWidth: "92vw",
      showCloseButton: false,
      customContent: (
        <AddServerModal
          onCancel={() => hideModal(modalId)}
          onCreated={(server) => {
            hideModal(modalId);
            targets.refreshServers();
            pick({ deployTarget: "server", serverId: server.id });
          }}
        />
      ),
    });
  };

  // Seed once targets resolve + nothing chosen: a valid server/cloud last pick,
  // else first server, else cloud. Local deploys are intentionally unavailable
  // from the Apps installer even if another deploy flow remembered one.
  useEffect(() => {
    if (!targets.ready || value) return;
    const last = lastPickStore.read();
    if (
      last?.target === "server" &&
      !!last.serverId &&
      targets.servers.some((s) => s.id === last.serverId)
    ) {
      onChange({ deployTarget: "server", serverId: last.serverId });
    } else if (last?.target === "cloud" && targets.hasCloudOption) {
      onChange({ deployTarget: "cloud" });
    } else if (targets.servers.length > 0) {
      onChange({ deployTarget: "server", serverId: targets.servers[0].id });
    } else if (targets.hasCloudOption) {
      onChange({ deployTarget: "cloud" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets.ready]);

  if (!targets.ready) {
    return <div className="h-16 animate-pulse rounded-xl border border-border/50 bg-card" />;
  }

  return (
    <div className="space-y-2">
      {hasServers && (
        <OptionCard
          value="server"
          selected={value?.deployTarget === "server"}
          onSelect={() => pick({
            deployTarget: "server",
            serverId: value?.deployTarget === "server" && value.serverId
              ? value.serverId
              : targets.servers[0].id,
          })}
          icon={<Server className="size-4" />}
          label={isSingleServer ? (targets.servers[0].name || targets.servers[0].sshHost) : opt.servers}
          description={isSingleServer
            ? opt.serverViaSsh
            : interpolate(opt.serversCount, { count: String(targets.servers.length) })}
        >
          {!isSingleServer && value?.deployTarget === "server" && (
            <ServerPicker
              servers={targets.servers}
              selectedId={value.serverId}
              onSelect={(server) => pick({ deployTarget: "server", serverId: server.id })}
              onAddServer={openAddServer}
            />
          )}
        </OptionCard>
      )}

      {targets.hasCloudOption && (
        <OptionCard
          value="cloud"
          selected={value?.deployTarget === "cloud"}
          onSelect={() => pick({ deployTarget: "cloud" })}
          icon={<Cloud className="size-4" />}
          label={opt.cloud}
          description={targets.hasCloudConnected ? opt.cloudConnectedDesc : opt.cloudDisconnectedDesc}
        />
      )}

      {!(value?.deployTarget === "server" && !isSingleServer) && (
        <button
          type="button"
          onClick={openAddServer}
          className="inline-flex items-center gap-1.5 px-1 pt-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3.5" /> {t.deploy.targetStep.addServer}
        </button>
      )}

    </div>
  );
}
