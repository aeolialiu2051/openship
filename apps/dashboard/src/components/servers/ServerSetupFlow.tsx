"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Download, Server, Wifi } from "lucide-react";
import { getApiErrorMessage, systemApi } from "@/lib/api";
import type { ComponentStatus, ServerInfo, SetupCompleteEvent } from "@/lib/api/system";
import { useSetupStream } from "@/hooks/useSetupStream";
import { useToast } from "@/context/ToastContext";
import { interpolate, useI18n } from "@/components/i18n-provider";
import { checkServerAfterInstall } from "@/lib/server-health";
import { CheckingState } from "@/app/(dashboard)/servers/new/_components/checking-state";
import { ErrorBanner } from "@/app/(dashboard)/servers/new/_components/error-banner";
import { InstallingPanel } from "@/app/(dashboard)/servers/new/_components/installing-panel";
import { ResultsPanel } from "@/app/(dashboard)/servers/new/_components/results-panel";
import type { ComponentState } from "@/app/(dashboard)/servers/new/_components/types";

type SetupPhase = "checking" | "results" | "installing";

function buildComponentStates(statuses: ComponentStatus[]): ComponentState[] {
  return statuses.map((status) => ({
    name: status.name,
    label: status.label,
    description: status.description,
    status,
    installState: status.healthy ? "installed" : "idle",
  }));
}

function missingInstallableComponents(components: ComponentState[]): string[] {
  return components
    .filter(
      (component) =>
        !component.status?.healthy &&
        !component.status?.optional &&
        component.status?.installable !== false,
    )
    .map((component) => component.name);
}

function SetupProgress({
  phase,
  serverHost,
  installCompleted,
}: {
  phase: SetupPhase;
  serverHost: string;
  installCompleted: boolean;
}) {
  const { t } = useI18n();
  const activeIndex = phase === "checking" ? 1 : phase === "installing" ? 2 : 1;
  const steps = [
    { label: t.servers.setup.stepConnect, Icon: Wifi },
    { label: t.servers.setup.stepCheck, Icon: Check },
    { label: t.servers.setup.stepInstall, Icon: Download },
  ];

  return (
    <div className="rounded-2xl border border-border/50 bg-card px-5 py-4">
      <div className="flex items-center gap-3 pe-10">
        <div className="flex size-9 items-center justify-center rounded-xl bg-info-bg">
          <Server className="size-[18px] text-info" />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">
            {t.servers.setup.serverSetup}
          </h2>
          <p className="text-xs text-muted-foreground">
            {phase === "checking"
              ? t.servers.setup.subChecking
              : phase === "installing"
                ? t.servers.setup.subInstalling
                : interpolate(t.servers.setup.subResults, { host: serverHost })}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {steps.map(({ label, Icon }, index) => {
          const complete =
            index < activeIndex ||
            (phase === "results" && (index <= 1 || (index === 2 && installCompleted)));
          const active = index === activeIndex && phase !== "results";
          return (
            <div
              key={label}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                active
                  ? "bg-primary/10 text-primary"
                  : complete
                    ? "bg-success-bg text-success"
                    : "bg-muted/40 text-muted-foreground"
              }`}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ServerSetupFlow({
  server,
  onDone,
}: {
  server: ServerInfo;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [phase, setPhase] = useState<SetupPhase>("checking");
  const [components, setComponents] = useState<ComponentState[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installCompleted, setInstallCompleted] = useState(false);

  const checkServer = useCallback(
    async (showChecking = true) => {
      if (showChecking) setPhase("checking");
      setError(null);
      try {
        const result = await systemApi.checkServer(server.id);
        setComponents(buildComponentStates(result.components));
        setReady(result.ready);
        setPhase("results");
      } catch (err) {
        setReady(false);
        setError(getApiErrorMessage(err, t.servers.setup.toastHealthCheckFailed));
        setPhase("results");
      }
    },
    [server.id, t.servers.setup.toastHealthCheckFailed],
  );

  const handleInstallComplete = useCallback(
    async (event: SetupCompleteEvent) => {
      setInstallCompleted(event.status === "completed");
      setError(null);
      try {
        const result = await checkServerAfterInstall(server.id);
        setComponents(buildComponentStates(result.components));
        setReady(result.ready);
        setPhase("results");
      } catch (error) {
        setReady(false);
        setError(getApiErrorMessage(error, t.servers.setup.toastHealthCheckFailed));
        setPhase("results");
      }
      showToast(
        event.status === "completed"
          ? t.servers.setup.toastSetupCompleted
          : t.servers.setup.toastSomeComponentsFailed,
        event.status === "completed" ? "success" : "error",
        t.servers.toastTitles.serverSetup,
      );
    },
    [server.id, showToast, t],
  );

  const setupStream = useSetupStream({
    onComplete: (event) => {
      void handleInstallComplete(event);
    },
    onError: (streamError) => {
      setError(getApiErrorMessage(streamError, t.servers.setup.toastFailedStartInstall));
      setPhase("results");
    },
  });

  useEffect(() => {
    void checkServer();
  }, [checkServer]);

  async function installMissing(names?: string[]) {
    const targets = names?.length ? names : missingInstallableComponents(components);
    if (targets.length === 0) {
      await checkServer();
      return;
    }
    setError(null);
    setPhase("installing");
    await setupStream.startInstall(server.id, targets);
  }

  const serverHost = server.sshHost || server.name || t.servers.setup.yourServer;

  return (
    <div className="space-y-4 p-1">
      <SetupProgress
        phase={phase}
        serverHost={serverHost}
        installCompleted={installCompleted}
      />
      {error && <ErrorBanner message={error} />}

      {phase === "checking" && <CheckingState />}

      {phase === "results" && (
        <ResultsPanel
          components={components}
          serverHost={serverHost}
          overallReady={ready}
          mode="manual"
          onAutoInstall={() => {
            void installMissing();
          }}
          onManualContinue={() => {
            void installMissing();
          }}
          onRecheck={() => {
            void checkServer();
          }}
          onDone={onDone}
          onSkip={onDone}
          doneLabel={t.servers.setup.setupComplete}
        />
      )}

      {phase === "installing" && (
        <InstallingPanel
          components={setupStream.components}
          logs={setupStream.logs}
          serverHost={serverHost}
          isDone={setupStream.isDone}
          finalStatus={setupStream.finalStatus}
          onDone={onDone}
          onRetry={() => {
            const failed = setupStream.components
              .filter((component) => component.status === "failed")
              .map((component) => component.name);
            void installMissing(failed);
          }}
        />
      )}
    </div>
  );
}
