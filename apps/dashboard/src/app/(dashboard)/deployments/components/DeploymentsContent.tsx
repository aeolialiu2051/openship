"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Rocket,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  ArrowRight,
} from "lucide-react";
import { deployApi, projectsApi } from "@/lib/api";
import { useI18n, interpolate } from "@/components/i18n-provider";
import { DeploymentsFilters } from "./DeploymentsFilters";
import { DeploymentsList } from "./DeploymentsList";
import { LoadingSkeleton } from "./LoadingSkeleton";
import type { Deployment, Project } from "../types";
import {
  calculateDeploymentStats,
  filterDeployments,
  sortDeploymentsByDate,
  mapRowToDeployment,
} from "../utils";
import { invalidateProjectsHomeCache } from "@/hooks/useProjectsHome";
import { useDeploymentsList } from "@/hooks/useDeploymentsList";

interface DeploymentsContentProps {
  /** When set, scope to this project and hide the project selector */
  projectId?: string;
  projectName?: string;
  hideHeader?: boolean;
  hideSidebar?: boolean;
}

export const DeploymentsContent: React.FC<DeploymentsContentProps> = ({
  projectId,
  projectName,
  hideHeader = false,
  hideSidebar = false,
}) => {
  const { t } = useI18n();
  const isProject = !!projectId;
  const globalDeploymentsQuery = useDeploymentsList(!isProject);

  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const [filter, setFilter] = useState<
    "all" | "success" | "failed" | "building" | "pending" | "canceled"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | "all">(
    "all"
  );

  const fetchDeployments = useCallback(async () => {
    // Keep existing cards visible during status refreshes. Replacing the whole
    // list with skeletons every time a background operation changes state made
    // otherwise-fast actions feel janky.
    if (!hasLoadedRef.current) setIsLoading(true);
    let succeeded = false;
    try {
      if (isProject && projectId) {
        const res = await projectsApi.getDeployments(projectId);
        const rows: any[] = res.data ?? res.deployments ?? [];
        const mapped = rows.map((r: any) =>
          mapRowToDeployment({
            ...r,
            projectId,
            projectName: projectName ?? r.projectName,
          })
        );
        setDeployments(sortDeploymentsByDate(mapped));
        setProjects([]);
      } else {
        const res = await globalDeploymentsQuery.refresh();
        const rows: any[] = res.data ?? [];
        const mapped = rows.map(mapRowToDeployment);
        setDeployments(sortDeploymentsByDate(mapped));

        const projectMap = new Map<string, Project>();
        for (const d of mapped) {
          if (d.projectId && d.projectName) {
            projectMap.set(d.projectId, {
              id: d.projectId,
              name: d.projectName,
            });
          }
        }
        setProjects([...projectMap.values()]);
      }
      succeeded = true;
    } catch {
      /* silent */
    } finally {
      hasLoadedRef.current = true;
      setIsLoading(false);
    }
    return succeeded;
  }, [globalDeploymentsQuery.refresh, isProject, projectId, projectName]);

  useEffect(() => {
    if (isProject) void fetchDeployments();
  }, [fetchDeployments, isProject]);

  useEffect(() => {
    if (isProject) return;
    const res = globalDeploymentsQuery.data;
    if (!res) {
      if (globalDeploymentsQuery.error) setIsLoading(false);
      return;
    }
    const rows: any[] = res.data ?? [];
    const mapped = rows.map(mapRowToDeployment);
    setDeployments(sortDeploymentsByDate(mapped));
    const projectMap = new Map<string, Project>();
    for (const deployment of mapped) {
      if (deployment.projectId && deployment.projectName) {
        projectMap.set(deployment.projectId, {
          id: deployment.projectId,
          name: deployment.projectName,
        });
      }
    }
    setProjects([...projectMap.values()]);
    hasLoadedRef.current = true;
    setIsLoading(false);
  }, [globalDeploymentsQuery.data, globalDeploymentsQuery.error, isProject]);

  // One list-level timer observes every active deletion. The listing endpoint
  // already batches operation lookup for all visible rows, so this replaces N
  // per-card timers and N status requests with a single lightweight refresh.
  const hasActiveDeletion = deployments.some(
    (deployment) =>
      deployment.deletionOperationStatus === "queued" ||
      deployment.deletionOperationStatus === "running",
  );

  useEffect(() => {
    if (!hasActiveDeletion) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveFailures = 0;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      const visibilityDelay =
        document.visibilityState === "hidden" ? Math.max(delayMs, 10_000) : delayMs;
      timer = setTimeout(() => void poll(), visibilityDelay);
    };

    const poll = async () => {
      invalidateProjectsHomeCache();
      const succeeded = await fetchDeployments();
      if (cancelled) return;
      consecutiveFailures = succeeded ? 0 : consecutiveFailures + 1;
      schedule(
        succeeded
          ? 2_000
          : Math.min(3_000 * 2 ** (consecutiveFailures - 1), 15_000),
      );
    };

    schedule(2_000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchDeployments, hasActiveDeletion]);

  const filteredDeployments = useMemo(
    () =>
      filterDeployments(deployments, {
        status: filter,
        searchQuery,
        projectId: selectedProjectId,
      }),
    [deployments, filter, searchQuery, selectedProjectId]
  );

  const stats = useMemo(
    () => calculateDeploymentStats(deployments),
    [deployments]
  );

  const activeCount = (stats.building || 0) + (stats.pending || 0);
  const failedCount = (stats.failed || 0) + (stats.canceled || 0);

  return (
    <div>
      {/* Header */}
      {!hideHeader && (
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t.deployments.header.title}
          </h1>
          <p className="text-sm text-muted-foreground/70 mt-1">
            {isLoading
              ? t.deployments.header.loading
              : isProject
                ? interpolate(
                    deployments.length === 1
                      ? t.deployments.header.countProjectOne
                      : t.deployments.header.countProjectOther,
                    { count: String(deployments.length) },
                  )
                : interpolate(
                    projects.length === 1
                      ? t.deployments.header.countAllOne
                      : t.deployments.header.countAllOther,
                    {
                      deployments: String(deployments.length),
                      projects: String(projects.length),
                    },
                  )}
          </p>
        </div>
      )}

      {/* Main Grid */}
      <div className={hideSidebar ? "" : "grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6"}>
        {/* LEFT COLUMN */}
        <div className="space-y-4 min-w-0">
          {isLoading ? (
            <LoadingSkeleton />
          ) : (
            <>
              <DeploymentsFilters
                isProject={isProject}
                filter={filter}
                searchQuery={searchQuery}
                selectedProjectId={selectedProjectId}
                projects={projects}
                onFilterChange={setFilter}
                onSearchChange={setSearchQuery}
                onProjectChange={setSelectedProjectId}
              />

              <DeploymentsList
                deployments={filteredDeployments}
                hasFilters={
                  filter !== "all" ||
                  searchQuery !== "" ||
                  selectedProjectId !== "all"
                }
                onStatusChange={fetchDeployments}
              />
            </>
          )}
        </div>

        {/* RIGHT COLUMN (Sticky) */}
        {!hideSidebar && (
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {/* Activity Overview */}
          <div className="bg-card rounded-2xl border border-border/50 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="size-4 text-muted-foreground" />
              <h3 className="font-semibold text-foreground text-sm">{t.deployments.sidebar.overview.title}</h3>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Rocket className="size-4 text-primary" />
                  </div>
                  <span className="text-sm text-muted-foreground">{t.deployments.sidebar.overview.total}</span>
                </div>
                <span className="text-lg font-semibold text-foreground">
                  {isLoading ? "–" : stats.total}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-success-bg flex items-center justify-center">
                    <CheckCircle2 className="size-4 text-success" />
                  </div>
                  <span className="text-sm text-muted-foreground">{t.deployments.sidebar.overview.successful}</span>
                </div>
                <span className="text-lg font-semibold text-foreground">
                  {isLoading ? "–" : stats.success}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-danger-bg flex items-center justify-center">
                    <XCircle className="size-4 text-danger" />
                  </div>
                  <span className="text-sm text-muted-foreground">{t.deployments.sidebar.overview.failed}</span>
                </div>
                <span className="text-lg font-semibold text-foreground">
                  {isLoading ? "–" : failedCount}
                </span>
              </div>

              {activeCount > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-warning-bg flex items-center justify-center">
                      <Loader2 className="size-4 text-warning animate-spin" />
                    </div>
                    <span className="text-sm text-muted-foreground">{t.deployments.sidebar.overview.inProgress}</span>
                  </div>
                  <span className="text-lg font-semibold text-foreground">{activeCount}</span>
                </div>
              )}
            </div>

            {/* Success/failure proportion — at-a-glance fleet health, same
                semantic colors as the stat rows above. */}
            {!isLoading && stats.total > 0 && (
              <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-muted/40">
                {stats.success > 0 && (
                  <div className="bg-success-solid" style={{ width: `${(stats.success / stats.total) * 100}%` }} />
                )}
                {failedCount > 0 && (
                  <div className="bg-danger-solid" style={{ width: `${(failedCount / stats.total) * 100}%` }} />
                )}
                {activeCount > 0 && (
                  <div className="bg-warning-solid" style={{ width: `${(activeCount / stats.total) * 100}%` }} />
                )}
              </div>
            )}
          </div>

          {/* Quick Tip */}
          {deployments.length > 0 ? (
            <div className="bg-gradient-to-br from-primary/5 via-primary/3 to-transparent rounded-2xl border border-primary/10 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="size-4 text-primary" />
                <h3 className="font-semibold text-foreground text-sm">{t.deployments.sidebar.autoDeploy.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t.deployments.sidebar.autoDeploy.description}
              </p>
              {!isProject && (
                <Link
                  href="/projects"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 mt-3 transition-colors"
                >
                  {t.deployments.sidebar.autoDeploy.cta}
                  <ArrowRight className="size-3.5 rtl:rotate-180" />
                </Link>
              )}
            </div>
          ) : (
            <div className="bg-gradient-to-br from-primary/5 via-primary/3 to-transparent rounded-2xl border border-primary/10 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="size-4 text-primary" />
                <h3 className="font-semibold text-foreground text-sm">{t.deployments.sidebar.getStarted.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t.deployments.sidebar.getStarted.description}
              </p>
              <Link
                href="/library"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 mt-3 transition-colors"
              >
                {t.deployments.sidebar.getStarted.cta}
                <ArrowRight className="size-3.5 rtl:rotate-180" />
              </Link>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
};
