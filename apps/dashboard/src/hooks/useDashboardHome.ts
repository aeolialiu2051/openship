import { useProjectsHome, type OtherOrgHint } from "@/hooks/useProjectsHome";

interface DashboardNumbers {
  total_active_projects?: number;
  total_deployments?: number;
  total_success_deployments?: number;
  total_failed_deployments?: number;
}

/**
 * Surfaced from the API when the active org has zero visible projects.
 * Lets the dashboard show a "your projects are in [Other Org]" CTA
 * instead of just an empty state — the common "I deployed but it's
 * not here" symptom of a session that switched orgs.
 */
export type { OtherOrgHint };

export function useDashboardHome(initialData?: any) {
  const { projects, numbers, otherOrgs, isLoading, refresh } = useProjectsHome(initialData);
  return {
    projects,
    numbers: numbers as DashboardNumbers,
    otherOrgs,
    loading: isLoading,
    refresh,
  };
}
