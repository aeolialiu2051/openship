const routeDataPrefetchers: Record<string, () => Promise<unknown>> = {
  "/": () => import("@/hooks/useProjectsHome").then((mod) => mod.prefetchProjectsHome()),
  "/projects": () => import("@/hooks/useProjectsHome").then((mod) => mod.prefetchProjectsHome()),
  "/apps": () => import("@/hooks/useProjectsHome").then((mod) => mod.prefetchProjectsHome()),
  "/deployments": () => import("@/hooks/useDeploymentsList").then((mod) => mod.prefetchDeploymentsList()),
  "/servers": () => import("@/hooks/useServersList").then((mod) => mod.prefetchServersList()),
  "/backups": () => import("@/hooks/useBackupDestinationsList").then((mod) => mod.prefetchBackupDestinationsList()),
  "/jobs": () => import("@/hooks/useJobsOverview").then((mod) => mod.prefetchJobsOverview()),
};

/** Begin page-critical API work alongside the App Router prefetch. */
export function prefetchDashboardRouteData(href: string): void {
  const prefetch = routeDataPrefetchers[href];
  if (prefetch) void prefetch().catch(() => {});
}
