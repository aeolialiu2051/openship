"use client";

import {
  MoreVertical,
  HelpCircle,
  MessageSquare,
  Bug,
  BookOpen,
  ExternalLink,
  Check,
  Plus,
  X,
  ChevronDown,
  GitBranch,
  Tag,
  Loader2,
  FilePlus2,
  Trash2,
} from "lucide-react";
import dynamic from "next/dynamic";

import { OverviewTab } from "../components/OverviewTab";
import { isSchemaAppTemplate } from "@/components/app-settings/AppSettingsForm";
import { ProjectSidebar, ProjectMobileTabs } from "../components/ProjectSidebar";
import { DraftProjectView } from "../components/DraftProjectView";
import { getProjectStatus } from "@/utils/project-status";
import { useProjectSettings } from "@/context/ProjectSettingsContext";
import { useProjectInfo } from "@/hooks/useProjectEndpoints";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/context/ToastContext";
import { useModal } from "@/context/ModalContext";
import { useI18n, interpolate } from "@/components/i18n-provider";
import {
  ApiError,
  getApiErrorMessage,
  operationsApi,
  projectsApi,
  type ResourceOperationView,
} from "@/lib/api";
import ErrorState from "@/components/shared/ErrorState";
import { PageContainer } from "@/components/ui/PageContainer";
import DropdownMenu, { type MenuAction } from "@/components/ui/DropdownMenu";
import { DismissiblePopover } from "@/components/ui/Popover";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProjectDeletionTracker } from "@/context/ProjectDeletionContext";
import { getSupportEmail } from "@/lib/support-email";

const ProjectTabLoading = () => (
  <div className="space-y-4" aria-hidden="true">
    <div className="h-28 animate-pulse rounded-2xl border border-border/50 bg-card" />
    <div className="h-52 animate-pulse rounded-2xl border border-border/50 bg-card" />
  </div>
);

const ServicesTab = dynamic(
  () => import("../components/ServicesTab").then((module) => module.ServicesTab),
  { loading: ProjectTabLoading },
);
const DomainSettings = dynamic(
  () => import("../components/DomainSettings").then((module) => module.DomainSettings),
  { loading: ProjectTabLoading },
);
const Deployments = dynamic(
  () => import("../components/Deployments").then((module) => module.Deployments),
  { loading: ProjectTabLoading },
);
const GitSettings = dynamic(
  () => import("../components/GitSettings").then((module) => module.GitSettings),
  { loading: ProjectTabLoading },
);
const BuildSettings = dynamic(
  () => import("../components/BuildSettings").then((module) => module.BuildSettings),
  { loading: ProjectTabLoading },
);
const LogsSettings = dynamic(
  () => import("../components/LogsSettings").then((module) => module.LogsSettings),
  { loading: ProjectTabLoading },
);
const BackupSettings = dynamic(
  () => import("../components/BackupSettings").then((module) => module.BackupSettings),
  { loading: ProjectTabLoading },
);
const AdvancedSettings = dynamic(
  () => import("../components/AdvancedSettings").then((module) => module.AdvancedSettings),
  { loading: ProjectTabLoading },
);
const AppConfiguration = dynamic(
  () => import("../components/AppConfiguration").then((module) => module.AppConfiguration),
  { loading: ProjectTabLoading },
);

const branchToEnvironmentName = (branch: string) =>
  branch
    .split(/[/-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || branch;

const EnvironmentSwitcher = () => {
  const { projectData, environments, createEnvironment, activeTab } = useProjectSettings();
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [branches, setBranches] = useState<Array<{ name: string; sha?: string; protected?: boolean }>>([]);
  const [branchQuery, setBranchQuery] = useState("");
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [creatingBranch, setCreatingBranch] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualEnvironmentName, setManualEnvironmentName] = useState("");
  const [manualBranch, setManualBranch] = useState("");
  const [branchesLoadedForProject, setBranchesLoadedForProject] = useState<string | null>(null);
  const branchRequestId = useRef(0);

  const options =
    environments.length > 0
      ? environments
      : [
          {
            id: projectData.id,
            name: projectData.environmentName || t.projects.env.productionFallback,
            slug: projectData.environmentSlug || "production",
            type: projectData.environmentType || "production",
            gitBranch: projectData.gitBranch || "main",
            isApp: !!projectData.isApp,
            version: null,
          },
      ];

  const currentEnvironment =
    options.find((env) => env.id === projectData.id) ?? options[0];

  const existingBranches = useMemo(
    () => new Set(options.map((env) => env.gitBranch).filter(Boolean)),
    [options],
  );

  const visibleBranches = useMemo<Array<{ name: string; sha?: string; protected?: boolean }>>(() => {
    const query = branchQuery.trim().toLowerCase();

    return branches.filter((branchOption) =>
      query ? branchOption.name.toLowerCase().includes(query) : true,
    );
  }, [branchQuery, branches]);

  const closeMenus = useCallback(() => {
    branchRequestId.current += 1;
    setIsOpen(false);
    setIsAdding(false);
    setManualMode(false);
    setBranchQuery("");
    setManualEnvironmentName("");
    setManualBranch("");
    setCreatingBranch(null);
    setLoadingBranches(false);
  }, []);

  const activateBranchCreator = useCallback((branchSeed?: string) => {
    setIsAdding(true);
    setIsOpen(false);
    setManualMode(false);
    setBranchQuery(branchSeed ?? "");
    setManualEnvironmentName("");
    setManualBranch("");
    setCreatingBranch(null);
  }, []);

  const openSwitcher = useCallback(() => {
    if (isOpen) {
      closeMenus();
      return;
    }

    setIsOpen(true);
    setIsAdding(false);
    setManualMode(false);
    setBranchQuery("");
    setManualEnvironmentName("");
    setManualBranch("");
    setCreatingBranch(null);
    setLoadingBranches(false);
  }, [closeMenus, isOpen]);

  const openBranchCreator = useCallback(() => {
    if (isAdding) {
      closeMenus();
      return;
    }

    activateBranchCreator();
  }, [activateBranchCreator, closeMenus, isAdding]);

  useEffect(() => {
    const shouldCreateEnvironment = searchParams.get("createEnvironment") === "1";
    if (!projectData.id || !shouldCreateEnvironment) return;

    activateBranchCreator(searchParams.get("branch")?.trim() || undefined);
    router.replace(`/projects/${projectData.id}/${activeTab}`);
  }, [activeTab, activateBranchCreator, projectData.id, router, searchParams]);

  useEffect(() => {
    setBranches([]);
    setBranchesLoadedForProject(null);
  }, [projectData.id]);

  useEffect(() => {
    if (!projectData.id || !isAdding || branchesLoadedForProject === projectData.id) return;

    const requestId = branchRequestId.current + 1;
    branchRequestId.current = requestId;
    setLoadingBranches(true);

    projectsApi
      .getBranches(projectData.id)
      .then((response) => {
        if (branchRequestId.current !== requestId) return;
        const data = Array.isArray(response.data)
          ? response.data
          : Array.isArray(response.data?.data)
            ? response.data.data
          : Array.isArray(response.branches)
            ? response.branches
            : [];
        setBranches(
          data.map((branchOption: any) =>
            typeof branchOption === "string"
              ? { name: branchOption }
              : {
                  name: branchOption.name,
                  sha: branchOption.sha,
                  protected: branchOption.protected,
                },
          ).filter((branchOption: { name?: string }) => branchOption.name),
        );
      })
      .catch((error) => {
        if (branchRequestId.current !== requestId) return;
        const message = error instanceof Error ? error.message : t.projects.env.failedLoadBranches;
        showToast(message, "error", t.projects.env.toastBranchesTitle);
      })
      .finally(() => {
        if (branchRequestId.current !== requestId) return;
        setBranchesLoadedForProject(projectData.id);
        setLoadingBranches(false);
      });

    return () => {
      if (branchRequestId.current === requestId) {
        branchRequestId.current += 1;
      }
    };
  }, [branchesLoadedForProject, isAdding, projectData.id, showToast]);

  if (!projectData.id) return null;

  const handleSwitch = (projectId: string) => {
    if (!projectId || projectId === projectData.id) return;
    closeMenus();
    router.push(`/projects/${projectId}/${activeTab}`);
  };

  const handleAddBranch = async (selectedBranch: string) => {
    if (!selectedBranch || isCreating) return;

    const existing = options.find((env) => env.gitBranch === selectedBranch);
    if (existing) {
      handleSwitch(existing.id);
      return;
    }

    setCreatingBranch(selectedBranch);
    setIsCreating(true);

    try {
      const created = await createEnvironment({
        environmentName: branchToEnvironmentName(selectedBranch),
        environmentType: selectedBranch === "main" || selectedBranch === "master" ? "production" : "preview",
        gitBranch: selectedBranch,
        sourceMode: "branch",
      });
      if (created?.id) {
        closeMenus();
        router.push(`/projects/${created.id}/${activeTab}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t.projects.env.failedCreateEnvironment;
      showToast(message, "error", t.projects.env.toastEnvironmentTitle);
    } finally {
      setIsCreating(false);
      setCreatingBranch(null);
    }
  };

  const handleAddManual = async () => {
    const environmentName = manualEnvironmentName.trim();
    const customBranch = manualBranch.trim();

    if (!environmentName || isCreating) return;

    setIsCreating(true);

    try {
      const created = await createEnvironment({
        environmentName,
        environmentType: "development",
        gitBranch: customBranch || undefined,
        sourceMode: "manual",
      });
      if (created?.id) {
        closeMenus();
        router.push(`/projects/${created.id}/${activeTab}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t.projects.env.failedCreateEnvironment;
      showToast(message, "error", t.projects.env.toastEnvironmentTitle);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <DismissiblePopover
      open={isOpen || isAdding}
      onOpenChange={(open) => {
        if (!open) closeMenus();
      }}
      className="relative flex items-center gap-2"
    >
      <button
        type="button"
        onClick={openSwitcher}
        className="inline-flex h-9 max-w-[260px] items-center gap-2 rounded-full border border-border/50 bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
        aria-label={t.projects.env.switchAria}
      >
        <span className="truncate">{currentEnvironment.name}</span>
        {currentEnvironment.isApp ? (
          currentEnvironment.version ? (
            <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <Tag className="size-3" />
              <span className="truncate">{currentEnvironment.version}</span>
            </span>
          ) : null
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <GitBranch className="size-3" />
            <span className="truncate">{currentEnvironment.gitBranch}</span>
          </span>
        )}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
      <button
        type="button"
        onClick={openBranchCreator}
        className="inline-flex size-9 items-center justify-center rounded-full border border-border/50 bg-card text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        aria-label={t.projects.env.addBranchAria}
      >
        {isAdding ? <X className="size-4" /> : <Plus className="size-4" />}
      </button>

      {isOpen && (
        <div
          className="absolute end-11 top-full z-40 mt-2 w-[320px] overflow-hidden rounded-lg border border-border/50 shadow-xl"
          style={{ backgroundColor: "var(--th-card-bg-solid, var(--card))" }}
        >
          <div className="max-h-[320px] overflow-y-auto p-1">
            {options.map((env) => {
              const active = env.id === projectData.id;

              return (
                <button
                  key={env.id}
                  type="button"
                  onClick={() => handleSwitch(env.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-start transition-colors hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{env.name}</span>
                    {env.isApp ? (
                      env.version ? (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Tag className="size-3" />
                          <span className="truncate">{env.version}</span>
                        </span>
                      ) : null
                    ) : (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <GitBranch className="size-3" />
                        <span className="truncate">{env.gitBranch}</span>
                      </span>
                    )}
                  </span>
                  {active && <Check className="size-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isAdding && (
        <div
          className="absolute end-0 top-full z-40 mt-2 w-[340px] rounded-lg border border-border/50 p-2 shadow-xl"
          style={{ backgroundColor: "var(--th-card-bg-solid, var(--card))" }}
        >
          <div className="space-y-2">
            <input
              value={branchQuery}
              onChange={(event) => setBranchQuery(event.target.value)}
              placeholder={t.projects.env.searchBranches}
              className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary/40"
            />
            <div className="max-h-[280px] overflow-y-auto">
              {loadingBranches ? (
                <div className="flex h-24 items-center justify-center text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              ) : visibleBranches.length > 0 ? (
                visibleBranches.map((branchOption) => {
                  const exists = existingBranches.has(branchOption.name);
                  const creating = creatingBranch === branchOption.name;

                  return (
                    <button
                      key={branchOption.name}
                      type="button"
                      onClick={() => handleAddBranch(branchOption.name)}
                      disabled={isCreating && !creating}
                      className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-start transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <GitBranch className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {branchOption.name}
                          </span>
                          {branchOption.sha && (
                            <span className="text-xs text-muted-foreground">
                              {branchOption.sha.slice(0, 7)}
                            </span>
                          )}
                        </span>
                      </span>
                      {creating ? (
                        <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                      ) : exists ? (
                        <Check className="size-4 shrink-0 text-primary" />
                      ) : (
                        <Plus className="size-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {t.projects.env.noBranches}
                </div>
              )}
            </div>
            <div className="border-t border-border/50 pt-2">
              {manualMode ? (
                <div className="space-y-2">
                  <input
                    value={manualEnvironmentName}
                    onChange={(event) => setManualEnvironmentName(event.target.value)}
                    placeholder={t.projects.env.environmentName}
                    className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary/40"
                  />
                  <input
                    value={manualBranch}
                    onChange={(event) => setManualBranch(event.target.value)}
                    placeholder={t.projects.env.branchLabel}
                    className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary/40"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setManualMode(false)}
                      className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                    >
                      {t.projects.env.cancel}
                    </button>
                    <button
                      type="button"
                      onClick={handleAddManual}
                      disabled={!manualEnvironmentName.trim() || isCreating}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCreating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                      {t.projects.env.create}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setManualMode(true)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
                >
                  <FilePlus2 className="size-4 text-muted-foreground" />
                  {t.projects.env.manualEnvironment}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </DismissiblePopover>
  );
};

const ProjectSettingsContent = () => {
  const {
    projectData,
    setProjectData,
    projectNotFound,
    errorType,
    activeTab,
    tabs,
    id,
  } = useProjectSettings();
  // Project shell waits for project info specifically (not analytics).
  // Analytics is per-card now; the page-level gate is about whether we
  // know enough about the project to even render its tabs.
  const { isLoading: isLoadingProjectInfo, error: projectInfoError } = useProjectInfo(id);

  const { t, locale } = useI18n();
  const { showToast } = useToast();
  const { showModal, hideModal } = useModal();
  const { trackProjectDeletion } = useProjectDeletionTracker();
  const supportEmail = getSupportEmail();
  const router = useRouter();
  const [deletionOperationId, setDeletionOperationId] = useState<string | null>(null);
  const [deletionOperation, setDeletionOperation] = useState<ResourceOperationView | null>(null);
  const deleteOptionsRef = useRef({
    deleteApp: true,
    wipeVolumes: false,
    force: false,
  });
  const handledOperationRef = useRef<string | null>(null);

  const isDeleting = getProjectStatus(projectData) === "deleting";

  async function handleDeleteProject(
    deleteApp = true,
    wipeVolumes = false,
    force = false,
    forceOrphan = false,
  ) {
    deleteOptionsRef.current = { deleteApp, wipeVolumes, force };
    handledOperationRef.current = null;
    setDeletionOperation(null);
    // Optimistic - immediately show "Deleting" status
    setProjectData((prev: any) => ({ ...prev, deletedAt: new Date().toISOString() }));

    try {
      const response = await projectsApi.delete(projectData.id, {
        deleteApp,
        wipeVolumes,
        force,
        forceOrphan,
      });
      trackProjectDeletion({
        operationId: response.operationId,
        projectId: String(projectData.id),
        deleteApp,
      });
      setDeletionOperationId(response.operationId);
      showToast(
        t.projects.delete.queued,
        "success",
        t.projects.delete.cleaningUpTitle,
      );
      return;
    } catch (err) {
      // Always revert optimistic deletion on any failure - project still exists.
      setProjectData((prev: any) => ({ ...prev, deletedAt: null }));

      if (err instanceof ApiError && err.status === 409) {
        const body = (err.body ?? {}) as {
          code?: string;
          error?: string;
          message?: string;
          active?: Record<string, unknown>;
          canForceOrphan?: boolean;
          unrecoverable?: Array<{ step: string; error?: string }>;
        };
        // Graceful gate hit — there's active work (an in-flight deployment,
        // backup, or restore). The user already confirmed by typing the project
        // name, so escalate to a force teardown: the backend cancels the
        // in-flight work, waits for it to quiesce, then tears down and deletes.
        // Guard on `!force` so a forced call that somehow still reports active
        // work can't loop.
        if (body.code === "PROJECT_HAS_ACTIVE_WORK") {
          if (!force) {
            showToast(t.projects.delete.cancellingActiveWork, "success", t.projects.delete.cleaningUpTitle);
            void handleDeleteProject(deleteApp, wipeVolumes, true, forceOrphan);
            return;
          }
          showToast(
            body.error ?? t.projects.delete.hasActiveWork,
            "error",
            t.projects.delete.cannotDeleteTitle,
          );
          return;
        }
        if (body.code === "PROJECT_DELETION_IN_PROGRESS") {
          showToast(
            t.projects.delete.deletionInProgress,
            "error",
            t.projects.delete.deletionInProgressTitle,
          );
          return;
        }
        // Teardown ran but couldn't complete (row not deleted). Only happens
        // now when the server is REACHABLE but a destroy kept failing —
        // `canForceOrphan` lets the user drop the row anyway and let GC reclaim
        // the leaked resources later.
        const reasons = (body.unrecoverable ?? []).map((u) => u.step).join(", ");
        console.error("[delete-project] teardown failed", body.unrecoverable);
        // The source teardown couldn't complete. Rather than a jarring
        // window.confirm (or silently reverting to a plain "Draft"), surface a
        // themed module offering the storage-only delete (forceOrphan) — atomic
        // delete stays the default; this is the explicit bypass.
        if (body.canForceOrphan) {
          openForceOrphanModal(reasons, { deleteApp, wipeVolumes, force });
          return;
        }
        showToast(
          reasons
            ? interpolate(t.projects.delete.teardownFailedAt, { reasons })
            : body.message || body.error || t.projects.delete.teardownFailed,
          "error",
          t.projects.delete.cleanupFailedTitle,
        );
        return;
      }

      // 404: someone else already deleted the project in another tab.
      if (err instanceof ApiError && err.status === 404) {
        showToast(t.projects.delete.alreadyDeleted, "success");
        router.push("/");
        return;
      }

      showToast(getApiErrorMessage(err, t.projects.delete.failed), "error", t.projects.delete.failed);
    }
  }

  function openForceOrphanModal(
    reasons: string,
    options = deleteOptionsRef.current,
  ) {
    let modalId = "";
    modalId = showModal({
      maxWidth: "480px",
      customContent: (
        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-danger-bg text-danger">
              <Trash2 className="size-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-foreground">
                {t.projects.delete.forceModalTitle}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {t.projects.delete.forceModalBody}
              </p>
              {reasons && (
                <p className="mt-2 text-xs text-muted-foreground/70">{reasons}</p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => hideModal(modalId)}
              className="inline-flex h-9 items-center rounded-xl px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
            >
              {t.projects.delete.forceModalCancel}
            </button>
            <button
              type="button"
              onClick={() => {
                hideModal(modalId);
                void handleDeleteProject(
                  options.deleteApp,
                  options.wipeVolumes,
                  true,
                  true,
                );
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-danger-solid px-4 text-sm font-medium text-white transition-colors hover:bg-danger-solid/90"
            >
              <Trash2 className="size-3.5" />
              {t.projects.delete.forceModalConfirm}
            </button>
          </div>
        </div>
      ),
    });
  }

  function handleCompletedDeletion(operation: ResourceOperationView) {
    if (handledOperationRef.current === operation.id) return;
    handledOperationRef.current = operation.id;
    router.push("/");
  }

  // Discover a durable operation independently from the project's boolean
  // deletion lock. needs_action intentionally releases that lock so a retry is
  // possible; after a browser refresh the operation row is therefore the only
  // reliable source for restoring the cleanup UI.
  useEffect(() => {
    if (!id || deletionOperationId) return;
    let cancelled = false;

    void operationsApi
      .getActive("project_delete", String(id))
      .then(({ data: operation }) => {
        if (cancelled) return;
        trackProjectDeletion({
          operationId: operation.id,
          projectId: String(id),
          deleteApp: deleteOptionsRef.current.deleteApp,
        });
        setDeletionOperationId(operation.id);
        setDeletionOperation(operation);
        if (operation.status === "queued" || operation.status === "running") {
          setProjectData((prev: any) => ({
            ...prev,
            deletedAt: prev.deletedAt ?? new Date().toISOString(),
            deletionInProgress: true,
          }));
        }
      })
      .catch((err) => {
        // No active operation is the normal state for most project visits.
        if (!(err instanceof ApiError && err.status === 404)) {
          console.warn("[delete-project] active operation lookup failed", err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deletionOperationId, id, setProjectData, trackProjectDeletion]);

  // Poll the durable operation rather than holding the DELETE request open.
  // On refresh, recover the operation id from the resource lookup endpoint.
  useEffect(() => {
    // Do not poll by resource while the DELETE request is still enqueueing.
    // The optimistic `deletedAt` update makes `isDeleting` true immediately,
    // but the operation may not exist yet. Treating that transient 404 as a
    // failed cleanup produces a false error toast even though the queued
    // deletion subsequently completes. The discovery effect above restores
    // an operation id on refresh, so polling can always wait for a concrete id.
    if (!id || !deletionOperationId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveFailures = 0;

    const schedule = (delayMs = 2000) => {
      if (cancelled) return;
      const visibilityDelay =
        document.visibilityState === "hidden" ? Math.max(delayMs, 10_000) : delayMs;
      timer = setTimeout(() => void poll(), visibilityDelay);
    };

    const poll = async () => {
      try {
        const operation = (await operationsApi.get(deletionOperationId)).data;

        if (cancelled) return;
        consecutiveFailures = 0;
        setDeletionOperation(operation);
        if (
          operation.status === "completed" ||
          operation.status === "completed_with_warnings"
        ) {
          handleCompletedDeletion(operation);
          return;
        }
        if (operation.status === "needs_action") {
          if (handledOperationRef.current === operation.id) return;
          handledOperationRef.current = operation.id;
          setProjectData((prev: any) => ({
            ...prev,
            deletedAt: null,
            deletionInProgress: false,
          }));
          const reasons = (operation.result?.unrecoverable ?? [])
            .map((item) => item.step)
            .join(", ");
          openForceOrphanModal(reasons);
          return;
        }
        if (operation.status === "failed") {
          if (handledOperationRef.current === operation.id) return;
          handledOperationRef.current = operation.id;
          setProjectData((prev: any) => ({
            ...prev,
            deletedAt: null,
            deletionInProgress: false,
          }));
          return;
        }
        schedule();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          setProjectData((prev: any) => ({
            ...prev,
            deletedAt: null,
            deletionInProgress: false,
          }));
          setDeletionOperation(null);
          showToast(t.projects.delete.failed, "error", t.projects.delete.cleanupFailedTitle);
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          try {
            const response = await projectsApi.getInfo(id);
            if (response?.success && response.data) {
              setProjectData((prev: any) => ({
                ...prev,
                ...response.data,
                deletedAt: null,
              }));
              setDeletionOperation(null);
              return;
            }
          } catch (projectErr) {
            if (projectErr instanceof ApiError && projectErr.status === 404) {
              router.push("/");
              return;
            }
          }
        }
        consecutiveFailures += 1;
        schedule(Math.min(3000 * 2 ** (consecutiveFailures - 1), 15_000));
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [deletionOperationId, id]);

  const helpMenuActions: MenuAction[] = [
    {
      id: "support",
      label: t.projects.help.contactSupport,
      icon: <HelpCircle className="w-4 h-4" />,
      onClick: () => {
        window.open("https://vibrail.com/about", "_blank");
      },
    },
    {
      id: "report-issue",
      label: t.projects.help.reportIssue,
      icon: <Bug className="w-4 h-4" />,
      onClick: () => {
        window.open("https://vibrail.com/about", "_blank");
      },
    },
    {
      id: "feedback",
      label: t.projects.help.sendFeedback,
      icon: <MessageSquare className="w-4 h-4" />,
      onClick: () => {
        window.open("https://vibrail.com/about", "_blank");
      },
    },
    {
      id: "divider",
      divider: true,
    },
    {
      id: "documentation",
      label: t.projects.help.documentation,
      icon: <BookOpen className="w-4 h-4" />,
      onClick: () => {
        window.open("https://docs.vibrail.com/", "_blank");
      },
    },
    {
      id: "community",
      label: t.projects.help.joinCommunity,
      icon: <ExternalLink className="w-4 h-4" />,
      onClick: () => {
        window.open("https://discord.gg/vibrail", "_blank");
      },
    },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewTab />;
      case "services":
        return <ServicesTab />;
      case "domains":
        return <DomainSettings />;
      case "deployments":
        return <Deployments />;
      case "source":
      case "git":
        return <GitSettings />;
      case "runtime":
      case "settings":
        // Apps get the 2-mode Configuration surface (App settings | Deployment);
        // regular projects get the raw build/runtime config.
        return projectData.isApp && isSchemaAppTemplate(projectData.appTemplateId) ? (
          <AppConfiguration />
        ) : (
          <BuildSettings />
        );
      case "logs":
        return <LogsSettings />;
      case "backup":
        return <BackupSettings />;
      case "advanced":
        return (
          <div className="space-y-5">
            <AdvancedSettings onDeleteProject={handleDeleteProject} />
          </div>
        );
      default:
        return <OverviewTab />;
    }
  };

  if (projectNotFound) {
    return <ErrorState type={errorType || "project-not-found"} />;
  }

  // `projectData` (context state) is re-seeded from the fetch one tick AFTER
  // isLoadingProjectInfo flips false (via an effect in the provider). During
  // that lag it's still the empty seed (id: "") whose derived status is
  // "draft" — rendering it would flash the DraftProjectView for a frame before
  // the real project lands. Treat "data hasn't caught up to this id yet" as
  // still-loading. The `!projectInfoError` guard avoids an infinite skeleton
  // when the fetch genuinely failed (non-404) and the seed will never arrive.
  const projectDataReady = projectData.id === id;
  if (isLoadingProjectInfo || (!projectDataReady && !projectInfoError)) {
    // Mirror the post-load shell (header + two-column grid) so the
    // page doesn't jump when data lands. The right column gets its
    // own placeholder card to reserve the 340px track.
    return (
      <PageContainer>
        <div className="mb-6">
          <div className="flex items-center space-x-2 rtl:space-x-reverse text-sm text-muted-foreground mb-2">
            <div className="h-3 w-20 bg-muted/60 rounded animate-pulse" />
            <span>/</span>
            <div className="h-3 w-32 bg-muted/60 rounded animate-pulse" />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="h-7 w-40 bg-muted rounded animate-pulse" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          {/* ── LEFT COLUMN skeleton ── */}
          <div className="space-y-5 min-w-0">
            <div className="bg-card rounded-2xl border border-border/50 p-6 animate-pulse">
              <div className="h-5 w-48 bg-muted rounded-lg mb-2" />
              <div className="h-4 w-32 bg-muted/60 rounded-lg" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-card rounded-2xl border border-border/50 p-5 animate-pulse"
                >
                  <div className="h-3 w-20 bg-muted rounded mb-4" />
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((j) => (
                      <div key={j} className="flex justify-between">
                        <div className="h-3 w-16 bg-muted/60 rounded" />
                        <div className="h-3 w-24 bg-muted/60 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── RIGHT COLUMN skeleton ── */}
          <div className="hidden lg:block">
            <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
              <div className="bg-card rounded-2xl border border-border/50 p-5 animate-pulse">
                <div className="h-3 w-16 bg-muted/60 rounded mb-3" />
                <div className="h-5 w-40 bg-muted rounded" />
              </div>
              <div className="bg-card rounded-2xl border border-border/50 p-3 space-y-1 animate-pulse">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="h-9 w-full bg-muted/40 rounded-lg" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }
  // Draft / never-successfully-deployed projects (no active deployment)
  // get a focused screen instead of the analytics dashboard, which would
  // otherwise render empty. In-flight first builds (queued/building/
  // deploying) and live projects fall through to the normal layout.
  const status = getProjectStatus(projectData);
  const deletionNeedsAction = deletionOperation?.status === "needs_action";
  const showDeletionProgress =
    isDeleting ||
    deletionOperation?.status === "queued" ||
    deletionOperation?.status === "running" ||
    deletionNeedsAction;
  const deletionStep = deletionOperation?.currentStep
    ? (t.deployments.deletionProgress.steps as Record<string, string>)[
        deletionOperation.currentStep
      ] ?? t.projects.delete.cleaningUpTitle
    : t.projects.delete.cleaningUpTitle;
  const deletionProgressBanner = showDeletionProgress ? (
    <div
      className={`mb-5 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${
        deletionNeedsAction
          ? "border-warning/25 bg-warning-bg text-warning"
          : "border-danger/20 bg-danger-bg text-danger"
      }`}
    >
      {deletionNeedsAction ? (
        <Trash2 className="size-4 shrink-0" />
      ) : (
        <Loader2 className="size-4 shrink-0 animate-spin" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{deletionStep}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {deletionNeedsAction
            ? deletionOperation?.error?.message ?? t.deployments.status.cleanupNeedsAction
            : t.projects.delete.queued}
        </p>
      </div>
      {deletionOperation?.progress.total ? (
        <span className="text-xs font-medium text-muted-foreground">
          {interpolate(t.deployments.deletionProgress.stepCount, {
            current: String(deletionOperation.progress.current),
            total: String(deletionOperation.progress.total),
          })}
        </span>
      ) : null}
    </div>
  ) : null;
  const isNeverDeployed =
    ["draft", "failed", "cancelled"].includes(status) ||
    // A draft mid-delete: the optimistic `deletedAt` masks the draft status
    // as "deleting". Keep the focused draft screen (its own delete spinner
    // handles the pending state) instead of flipping to the analytics
    // dashboard for the duration of the teardown. A never-deployed project
    // has no activeDeploymentId — that's the discriminator vs. a live delete.
    (status === "deleting" && !projectData.activeDeploymentId);
  if (isNeverDeployed && activeTab === "overview") {
    return (
      <PageContainer>
        <div className="mb-6">
          <div className="flex items-center space-x-2 rtl:space-x-reverse text-sm text-muted-foreground mb-2">
            <Link href="/" className="hover:text-foreground transition-colors font-medium">
              {t.projects.detail.breadcrumbDashboard}
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">{projectData.name || t.projects.detail.projectFallback}</span>
          </div>
          {/* Logo intentionally omitted here — it lives in the DraftProjectView
              hero card below; showing it in both duplicates it. */}
          <h1 className="text-2xl font-semibold text-foreground truncate">
            {projectData.name || t.projects.detail.projectFallback}
          </h1>
        </div>
        {deletionProgressBanner}
        <DraftProjectView onDeleteProject={() => handleDeleteProject()} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Compact Header */}
      <div className="mb-6">
        <div className="flex items-center space-x-2 rtl:space-x-reverse text-sm text-muted-foreground mb-2">
          <Link href="/" className="hover:text-foreground transition-colors font-medium">
            {t.projects.detail.breadcrumbDashboard}
          </Link>
          <span>/</span>
          <Link
            href={`/projects/${projectData.id || "projectId"}/overview`}
            className="hover:text-foreground transition-colors font-medium"
          >
            {projectData.name || t.projects.detail.projectFallback}
          </Link>
          {activeTab !== "overview" && (
            <>
              <span>/</span>
              <span className="text-foreground font-medium">
                {tabs.find((tab) => tab.id === activeTab)?.label}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-foreground truncate">
              {tabs.find((tab) => tab.id === activeTab)?.label || t.projects.detail.overviewFallback}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <EnvironmentSwitcher />
            <DropdownMenu
              actions={helpMenuActions}
              trigger={<MoreVertical className="w-5 h-5 text-muted-foreground" />}
              ariaLabel={locale === "zh" ? "更多项目操作" : "More project actions"}
              align="right"
              triggerClassName="inline-flex size-9 items-center justify-center rounded-full border border-border/50 bg-card text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            />
          </div>
        </div>
      </div>

      {deletionProgressBanner}

      {projectData.moderationStatus === "suspended" && (
        <div className="mb-5 rounded-2xl border border-danger/25 bg-danger-bg px-4 py-3 text-danger">
          <p className="text-sm font-semibold">
            {locale === "zh" ? "该项目已被平台下架" : "This project has been taken offline"}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {projectData.suspendedReason ||
              (locale === "zh"
                ? "该项目因违反平台规定已停止对外访问。"
                : "This project is no longer publicly available because it violates platform rules.")}
          </p>
          {supportEmail ? (
            <a
              href={`mailto:${supportEmail}`}
              className="mt-2 inline-block text-xs font-medium text-danger underline underline-offset-2"
            >
              {locale === "zh" ? `如有异议，请联系 ${supportEmail}` : `Appeal: ${supportEmail}`}
            </a>
          ) : null}
        </div>
      )}

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        {/* ── LEFT COLUMN ── */}
        <div className="space-y-6 min-w-0">
          <ProjectMobileTabs />
          {renderTabContent()}
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="hidden lg:block">
          <ProjectSidebar />
        </div>
      </div>
    </PageContainer>
  );
};

export default ProjectSettingsContent;
