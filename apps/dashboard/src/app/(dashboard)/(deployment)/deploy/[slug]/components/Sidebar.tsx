"use client";

import React, { useCallback, useRef } from "react";
import { GitBranch, Rocket, Github, Loader2, Globe, Container, Server, Layers, Check, AlertCircle, Key, Plus, Copy, ExternalLink, Package } from "lucide-react";
import { useI18n, interpolate } from "@/components/i18n-provider";
import { CustomSelect } from "@/components/ui/CustomSelect";
import DropdownMenu from "@/components/ui/DropdownMenu";
import DomainSettings from "./DomainSettings";
import BuildSummary from "./BuildSummary";
import { CloudWaitlistModal } from "./CloudWaitlistModal";
import { useCloneStrategyGate } from "./CloneStrategyNudge";
import { useDeployment } from "@/context/DeploymentContext";
import {
  publicEndpointsNeedCloud,
  servicesNeedCloud,
  usesServiceDeployment,
  type BuildStrategy,
} from "@/context/deployment/types";
import { findCustomDomainProjectConflict } from "@/context/deployment/custom-domain-entitlement";
import { useCloud } from "@/context/CloudContext";
import { canUseCloudConnection, usePlatform } from "@/context/PlatformContext";
import { useModal } from "@/context/ModalContext";
import { useRouter, useSearchParams } from "next/navigation";
import { invalidateProjectCaches } from "@/hooks/useProjectEndpoints";
import {
  projectsApi,
  githubApi,
  domainsApi,
  getApiErrorMessage,
  type CustomDomainProjectQuota,
} from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { appendProjectRouteKey, resolveServiceHostnameLabel } from "@repo/core";

// ─── Deploy checklist for compose ────────────────────────────────────────────

const ComposeChecklist: React.FC = () => {
  const { config } = useDeployment();
  const { t } = useI18n();
  const { baseDomain } = usePlatform();
  const services = config.services || [];
  if (services.length === 0) return null;

  const exposedServices = services.filter((s) => s.exposed);
  const exposableServices = services.filter((s) => s.ports.length > 0);
  const envConfigured = services.filter(
    (s) => Object.keys(s.environment).length > 0,
  ).length;
  const totalEnvVars = services.reduce(
    (acc, s) => acc + Object.keys(s.environment).length,
    0,
  );
  const buildServices = services.filter((s) => s.build);

  const checks = [
    {
      label: t.deploy.checklist.servicesDetected,
      value: interpolate(t.deploy.checklist.servicesCount, { count: String(services.length) }),
      ok: services.length > 0,
      icon: Layers,
    },
    {
      label: t.deploy.checklist.publicDomains,
      value: exposedServices.length > 0
        ? interpolate(t.deploy.checklist.exposedOf, { exposed: String(exposedServices.length), exposable: String(exposableServices.length) })
        : interpolate(t.deploy.checklist.canBeExposed, { count: String(exposableServices.length) }),
      ok: exposedServices.length > 0,
      warn: exposedServices.length === 0 && exposableServices.length > 0,
      icon: Globe,
    },
    ...(buildServices.length > 0
      ? [{
          label: t.deploy.checklist.buildServices,
          value: interpolate(t.deploy.checklist.toBuild, { count: String(buildServices.length) }),
          ok: true,
          icon: Container,
        }]
      : []),
    {
      label: t.deploy.checklist.environment,
      value: totalEnvVars > 0
        ? interpolate(t.deploy.checklist.varsAcross, { vars: String(totalEnvVars), services: String(envConfigured) })
        : t.deploy.checklist.noEnvVars,
      ok: totalEnvVars > 0,
      icon: Key,
    },
  ];

  return (
    <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {t.deploy.checklist.title}
      </p>
      <div className="space-y-2">
        {checks.map((check) => {
          const Icon = check.icon;
          return (
            <div key={check.label} className="flex items-start gap-2.5">
              <div className={`mt-0.5 p-1 rounded-md ${
                check.ok
                  ? "bg-success-bg text-success"
                  : (check as any).warn
                    ? "bg-warning-bg text-warning"
                    : "bg-muted/50 text-muted-foreground/50"
              }`}>
                {check.ok ? (
                  <Check className="size-3" />
                ) : (check as any).warn ? (
                  <AlertCircle className="size-3" />
                ) : (
                  <Icon className="size-3" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground leading-tight">
                  {check.label}
                </p>
                <p className="text-xs text-muted-foreground leading-snug">
                  {check.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Exposed domains quick list */}
      {exposedServices.length > 0 && (
        <div className="pt-2 border-t border-border/30 space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {t.deploy.checklist.domains}
          </p>
          {exposedServices.map((svc) => {
            const managedLabel = resolveServiceHostnameLabel(
              config.projectName || config.repo || "project",
              svc.name,
              svc.domain,
              "compose",
            );
            const domain =
              svc.domainType === "custom" && svc.customDomain
                ? svc.customDomain
                : `${
                    config.routeKey
                      ? appendProjectRouteKey(managedLabel, config.routeKey)
                      : managedLabel
                  }.${baseDomain}`;
            return (
              <div key={svc.name} className="flex items-center gap-2">
                <Globe className="size-3 text-primary" />
                <span className="text-sm text-primary font-medium truncate">{domain}</span>
                <span className="text-xs text-muted-foreground ms-auto">{svc.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Sidebar ─────────────────────────────────────────────────────────────────

interface SidebarProps {
  onBranchScanningChange?: (branch: string | null) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onBranchScanningChange }) => {
  const { config, state, updateConfig, initializeFromRepo, startDeployment } = useDeployment();
  const { t } = useI18n();
  const { requireCloud } = useCloud();
  const { baseDomain, managedDomainNeedsCloud, selfHosted, deployMode } = usePlatform();
  const { showModal, hideModal } = useModal();
  const { showToast } = useToast();
  const router = useRouter();
  const isServices = usesServiceDeployment(config);
  const hasGitSource =
    !!config.owner &&
    !!config.repo &&
    !config.isApp &&
    config.sourceProvider !== "template" &&
    !config.localPath &&
    !config.uploadSessionId;

  // Copy a ready-to-run `git clone` command with a short-lived GitHub App
  // installation token. Cloud / GitHub-App mode only — surfaces a clear
  // message otherwise (the backend 409s in gh-CLI / PAT mode).
  const handleCopyCloneToken = useCallback(async () => {
    if (!hasGitSource) {
      showToast(t.deploy.sidebar.cloneTokenNoRepo, "error", t.deploy.sidebar.cloneTokenTitle);
      return;
    }
    try {
      const { command } = await githubApi.getCloneToken(config.owner, config.repo);
      await navigator.clipboard.writeText(command);
      showToast(
        t.deploy.sidebar.cloneTokenCopied,
        "success",
        t.deploy.sidebar.cloneTokenCopiedTitle,
      );
    } catch (err) {
      showToast(getApiErrorMessage(err, t.deploy.sidebar.cloneTokenFailed), "error", t.deploy.sidebar.cloneTokenTitle);
    }
  }, [config.owner, config.repo, hasGitSource, showToast, t]);
  const canConnectCloud = canUseCloudConnection({ selfHosted, deployMode });
  // Clone-strategy gate - only meaningful for self-hosted server deploys
  // where we need to pick how the repo gets cloned on the remote (local
  // build vs PAT vs existing GitHub credential). Vibrail Cloud has its own
  // connect-account flow, local builds don't need a remote credential.
  const cloneGate = useCloneStrategyGate();
  // Preload the entitlement while the user reviews the deploy form. The old
  // path learned about this only after ensure/buildAccess had started, so a
  // known Free-plan rejection arrived several seconds after clicking Deploy.
  const customDomainQuotaRef = useRef<CustomDomainProjectQuota | null>(null);
  const customDomainQuotaRequestRef = useRef<Promise<CustomDomainProjectQuota | null> | null>(null);
  const loadCustomDomainQuota = useCallback(() => {
    if (customDomainQuotaRef.current) {
      return Promise.resolve(customDomainQuotaRef.current);
    }
    if (customDomainQuotaRequestRef.current) {
      return customDomainQuotaRequestRef.current;
    }
    const request = domainsApi.quota()
      .then((response) => {
        customDomainQuotaRef.current = response.data;
        return response.data;
      })
      .catch(() => null)
      .finally(() => {
        customDomainQuotaRequestRef.current = null;
      });
    customDomainQuotaRequestRef.current = request;
    return request;
  }, []);

  React.useEffect(() => {
    void loadCustomDomainQuota();
  }, [loadCustomDomainQuota]);

  const customDomainLimitBlocksDeploy = useCallback(async () => {
    const quota = customDomainQuotaRef.current ?? await loadCustomDomainQuota();
    const claimedByAnotherProject = findCustomDomainProjectConflict(config, quota);
    if (!claimedByAnotherProject) return false;
    showToast(
      interpolate(t.projectSettings.domains.add.projectLimitDescription, {
        project: claimedByAnotherProject.projectName,
      }),
      "error",
      t.projectSettings.domains.add.projectLimitTitle,
    );
    return true;
  }, [config, loadCustomDomainQuota, showToast, t]);

  // A branch change invalidates every repository-derived setting, not just the
  // branch label. Keep the current config visible until the new scan succeeds.
  const [pendingBranch, setPendingBranch] = React.useState<string | null>(null);
  const handleBranchChange = useCallback(async (nextBranch: string) => {
    if (
      pendingBranch ||
      nextBranch === config.branch ||
      !hasGitSource
    ) {
      return;
    }

    setPendingBranch(nextBranch);
    onBranchScanningChange?.(nextBranch);
    try {
      const result = await initializeFromRepo(config.owner, config.repo, undefined, {
        branch: nextBranch,
        projectId: config.projectId,
      });
      if (!result.success) {
        showToast(
          result.error || t.deploy.page.errorLoadRepoFailed,
          "error",
          t.deploy.page.errorLoadRepoTitle,
        );
      }
    } catch (error) {
      showToast(
        getApiErrorMessage(error, t.deploy.page.errorLoadRepoFailed),
        "error",
        t.deploy.page.errorLoadRepoTitle,
      );
    } finally {
      setPendingBranch(null);
      onBranchScanningChange?.(null);
    }
  }, [
    config.branch,
    config.owner,
    config.projectId,
    config.repo,
    hasGitSource,
    initializeFromRepo,
    onBranchScanningChange,
    pendingBranch,
    showToast,
    t,
  ]);

  // Lazy branch list. In config-edit mode the wizard hydrates from saved data
  // with only the current branch seeded (no repo round-trip on load). The full
  // list is fetched once, on first open of the branch dropdown — never for
  // local-sourced projects (no remote repo to list).
  const branchesFetchedRef = useRef(false);
  const loadBranches = useCallback(async () => {
    if (branchesFetchedRef.current) return;
    if (!config.projectId || !hasGitSource) return;
    // Only when the list is "thin" (config-edit seeds just the current branch);
    // the first-deploy path already preloads the full list via prepare.
    if (config.branches.length > 1) return;
    branchesFetchedRef.current = true;
    try {
      const res = await projectsApi.getBranches(config.projectId);
      const names: string[] = (res?.data ?? [])
        .map((b: { name?: string }) => b?.name)
        .filter((n: unknown): n is string => typeof n === "string" && n.length > 0);
      if (names.length) {
        const merged = Array.from(new Set([config.branch, ...names].filter(Boolean)));
        updateConfig({ branches: merged });
      }
    } catch {
      branchesFetchedRef.current = false; // allow a retry on next open
    }
  }, [config.projectId, config.branch, config.branches.length, hasGitSource, updateConfig]);

  const handleOpenEnvironmentCreator = useCallback(() => {
    if (!config.projectId) return;

    const params = new URLSearchParams({ createEnvironment: "1" });
    if (config.branch) {
      params.set("branch", config.branch);
    }

    router.push(`/projects/${config.projectId}?${params.toString()}`);
  }, [config.branch, config.projectId, router]);

  // Server workloads have a fixed Docker runtime, so deploy proceeds without a
  // runtime-selection interruption.
  const continueDeploy = useCallback(async (overrides?: { buildStrategy?: BuildStrategy }) => {
    const deploymentId = await startDeployment(overrides);
    if (deploymentId) {
      router.push(`/build/${deploymentId}`);
    }
  }, [startDeployment, router]);

  const handleDeploy = useCallback(async () => {
    // TODO: removed — temporary SaaS gate. The managed cloud isn't open yet, so
    // pressing Deploy on the hosted control plane shows the "Cloud is almost
    // here" waitlist instead of running a deploy. Self-hosted / desktop deploys
    // are unaffected. Delete this block (+ CloudWaitlistModal + the
    // /api/cloud-waitlist route) when Cloud launches.
    if (!selfHosted && config.deployTarget === "cloud") {
      let modalId = "";
      modalId = showModal({
        customContent: <CloudWaitlistModal onClose={() => hideModal(modalId)} />,
        maxWidth: "460px",
      });
      return;
    }

    // Fast client-side entitlement guard. The backend remains authoritative,
    // but a quota already fetched while rendering can reject this click before
    // project ensure, deployment creation, clone preflight, or any build work.
    if (await customDomainLimitBlocksDeploy()) return;

    if (config.deployTarget === "cloud") {
      if (!(await requireCloud("cloud-deploy-target"))) return;
    }

    // ── Clone-strategy resolution (self-hosted server deploys) ──────────
    // Deterministic — never ask when the answer is knowable. Server-side clone
    // is the DEFAULT: any resolvable credential (local gh forwarded over the
    // relay, Vibrail GitHub App / custom PAT, or a per-server credential) lets the
    // clone run on the remote worker. We no longer flip to a local build just
    // because gh is logged in — the gh token is now forwarded for the clone,
    // which the user opted into as the default. Only an EXPLICIT "build local"
    // preference builds on this host; a genuine no-credential case surfaces the
    // modal (and even that degrades to an api-host clone server-side).
    // buildStrategy="local" already clones on the API host; cloud targets go
    // through requireCloud; local targets don't clone.
    // Server-side clone is the default. We do NOT guess client-side whether a
    // GitHub credential exists — that duplicated the server's tokenFor("remote")
    // priority and drifted from it (the "client says OK, server rejects at
    // preflight" dead-end). The server preflight is the single authority now: a
    // genuinely-missing credential fails preflight and the deploy catch opens
    // the DeployCredentialModal (useDeploymentBuild.maybeOpenCredentialModal),
    // identical for the wizard and redeploy. The only client decision kept here
    // is the explicit "build on this machine" preference.
    let buildStrategyOverride: BuildStrategy | undefined;
    if (
      config.deployTarget === "server" &&
      config.buildStrategy === "server" &&
      cloneGate.preference === "local"
    ) {
      buildStrategyOverride = "local";
    }

    if (
      !isServices &&
      !config.noPublicRoute &&
      managedDomainNeedsCloud &&
      canConnectCloud &&
      config.deployTarget !== "cloud" &&
      publicEndpointsNeedCloud(config.publicEndpoints)
    ) {
      if (!(await requireCloud("managed-project-domain", { domain: baseDomain }))) return;
    }

    // Compose services with free managed domains require cloud
    if (managedDomainNeedsCloud && isServices && servicesNeedCloud(config.services)) {
      if (!(await requireCloud("managed-compose-domains", { domain: baseDomain }))) return;
    }

    if (isServices && shouldWarnAboutUnreachableServices(config.services)) {
      let modalId = "";
      modalId = showModal({
        customContent: (
          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-foreground">{t.deploy.sidebar.unreachableTitle}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t.deploy.sidebar.unreachableBody}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t.deploy.sidebar.beforeDeploying}</p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>{t.deploy.sidebar.unreachableStep1}</li>
                <li>{t.deploy.sidebar.unreachableStep2}</li>
                <li>{t.deploy.sidebar.unreachableStep3}</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                className="rounded-lg border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80"
                onClick={() => hideModal(modalId)}
              >
                {t.deploy.sidebar.reviewServices}
              </button>
              <button
                type="button"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                onClick={async () => {
                  hideModal(modalId);
                  await continueDeploy();
                }}
              >
                {t.deploy.sidebar.deployAnyway}
              </button>
            </div>
          </div>
        ),
        maxWidth: "560px",
      });
      return;
    }

    await continueDeploy(buildStrategyOverride ? { buildStrategy: buildStrategyOverride } : undefined);
  }, [baseDomain, canConnectCloud, cloneGate.preference, config.buildStrategy, config.deployTarget, config.noPublicRoute, config.publicEndpoints, config.services, continueDeploy, customDomainLimitBlocksDeploy, hideModal, isServices, managedDomainNeedsCloud, requireCloud, selfHosted, showModal, t]);

  // Edit mode (opened from the project Runtime page with ?mode=config): the
  // finish button SAVES the config to the project and returns — no deploy, no
  // deploy gates (cloud/clone/domain checks are deploy concerns). Deploying is
  // the separate "Redeploy" action on the project page.
  const searchParams = useSearchParams();
  const isConfigMode = searchParams.get("mode") === "config";
  const [isSaving, setIsSaving] = React.useState(false);
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const projectId = await startDeployment({ saveConfigOnly: true });
      if (projectId) {
        // Bust the cached project info so the Runtime tab shows the just-saved
        // config (it's served from infoCache and would otherwise be stale), then
        // return to the Runtime tab the user edited from — not the default tab.
        invalidateProjectCaches(projectId);
        router.push(`/projects/${projectId}/runtime`);
      }
    } finally {
      setIsSaving(false);
    }
  }, [startDeployment, router]);

  return (
    <div className="lg:sticky lg:top-6 h-fit space-y-4">
      {/* Repository Info */}
      <div className="border border-border/50 rounded-xl bg-card overflow-hidden">
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-0">
          <span className="w-2.5 h-2.5 rounded-full bg-foreground/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-foreground/10" />
          <span className="w-2.5 h-2.5 rounded-full bg-foreground/[0.07]" />
        </div>
        <div className="p-4 pt-3">
          <div className="flex items-center gap-3">
            {config.uploadSessionId || config.sourceProvider === "template" ? (
              <Package className="size-4 text-muted-foreground shrink-0" />
            ) : (
              <Github className="size-4 text-muted-foreground shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              {hasGitSource ? (
                <a
                  href={`https://github.com/${config.owner}/${config.repo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${config.owner}/${config.repo}`}
                  className="group inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-primary"
                >
                  <span className="truncate">{config.owner}/{config.repo}</span>
                  <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-primary" />
                </a>
              ) : (
                <p className="text-sm font-medium text-foreground truncate">
                  {config.uploadSessionId || config.sourceProvider === "template"
                    ? config.repo
                    : `${config.owner}/${config.repo}`}
                </p>
              )}
            </div>
            {hasGitSource && (
              <DropdownMenu
                align="right"
                triggerClassName="p-1.5 -me-1 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                actions={[
                  {
                    id: "clone-token",
                    label: t.deploy.sidebar.copyCloneToken,
                    icon: <Copy className="size-4" />,
                    onClick: handleCopyCloneToken,
                  },
                ]}
              />
            )}
          </div>
          {hasGitSource && config.branches.length > 0 && (
            <div className="mt-3">
              <CustomSelect
                value={pendingBranch ?? config.branch}
                onChange={handleBranchChange}
                onOpen={loadBranches}
                disabled={pendingBranch !== null}
                options={config.branches.map(branch => ({
                  value: branch,
                  label: branch,
                  icon: pendingBranch === branch
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <GitBranch className="w-3.5 h-3.5" />
                }))}
                footerAction={config.projectId
                  ? {
                      label: t.deploy.sidebar.newEnvironment,
                      icon: <Plus className="w-3.5 h-3.5 text-muted-foreground" />,
                      onClick: handleOpenEnvironmentCreator,
                    }
                  : undefined}
                placeholder={t.deploy.sidebar.selectBranch}
                className="w-full"
              />
            </div>
          )}
          {hasGitSource && config.branches.length === 0 && config.branch && (
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <GitBranch className="size-3" />
              {config.branch}
            </div>
          )}
        </div>
      </div>

      {/* Domain - per-service for compose, checklist for others.
          Monorepo flows through the single-app DomainSettings: its
          `<PublicEndpointsCard>` already supports multiple endpoints
          (the "+" button at the header adds another Domain card). The
          monorepo init seeds `config.publicEndpoints` with one entry
          per sub-app so the existing card renders them all without a
          parallel UI. */}
      {isServices ? (
        <ComposeChecklist />
      ) : (
        <DomainSettings
          projectId={config.projectId}
          projectName={config.projectName}
          routeKey={config.routeKey}
          endpoints={config.publicEndpoints}
          hasServer={config.options.hasServer}
          runtimePort={config.options.productionPort}
          setEndpoints={(publicEndpoints, nextRuntimePort) => updateConfig({
            publicEndpoints,
            ...(nextRuntimePort !== undefined
              ? {
                  options: {
                    ...config.options,
                    productionPort: nextRuntimePort,
                  },
                }
              : {}),
          })}
          noPublicRoute={config.noPublicRoute ?? false}
          setNoPublicRoute={(noPublicRoute) => updateConfig({ noPublicRoute })}
        />
      )}

      {/* Finish: Save (edit mode) or Deploy (create/first-deploy). Editing
          config from the project Runtime page SAVES without deploying — deploy
          is the separate "Redeploy" action. */}
      {isConfigMode ? (
        <button
          onClick={handleSave}
          disabled={isSaving || pendingBranch !== null}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-primary text-primary-foreground text-sm font-medium rounded-xl hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t.deploy.sidebar.saving}
            </>
          ) : (
            <>
              <Check className="size-4" />
              {t.deploy.sidebar.saveChanges}
            </>
          )}
        </button>
      ) : (
        <button
          onClick={handleDeploy}
          disabled={state.isDeploying || pendingBranch !== null}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-primary text-primary-foreground text-sm font-medium rounded-xl hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state.isDeploying ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t.deploy.sidebar.deploying}
            </>
          ) : (
            <>
              <Rocket className="size-4" />
              {t.deploy.sidebar.deploy}
            </>
          )}
        </button>
      )}

      {/* Build Summary */}
      <BuildSummary />
    </div>
  );
};

export default React.memo(Sidebar);

function hasConnectedDomain(service: {
  exposed?: boolean;
  domainType?: "free" | "custom";
  customDomain?: string;
  domain?: string;
  name?: string;
}) {
  if (!service.exposed) return false;
  if (service.domainType === "custom") return Boolean(service.customDomain?.trim());
  return Boolean(service.domain?.trim() || service.name?.trim());
}

function shouldWarnAboutUnreachableServices(services: Array<{
  image?: string;
  name: string;
  ports: string[];
  exposed?: boolean;
  domainType?: "free" | "custom";
  customDomain?: string;
  domain?: string;
}>) {
  const candidates = services.filter((service) => service.ports.length > 0);
  if (candidates.length === 0) return false;
  return candidates.every((service) => !hasConnectedDomain(service));
}
