"use client";

import {
  jobsApi,
  type BackupScheduleView,
  type JobView,
} from "@/lib/api";
import { createClientQuery, useClientQuery } from "@/lib/client-query-cache";

export interface JobsOverviewData {
  jobs: JobView[];
  backupSchedules: BackupScheduleView[];
}

const jobsOverviewQuery = createClientQuery<JobsOverviewData>(async () => {
  const [jobs, backupSchedules] = await Promise.all([
    jobsApi.list(),
    jobsApi.backupSchedules().catch(() => ({ data: [] as BackupScheduleView[] })),
  ]);
  return {
    jobs: jobs?.data ?? [],
    backupSchedules: backupSchedules?.data ?? [],
  };
}, { ttlMs: 15_000 });

export function prefetchJobsOverview() {
  return jobsOverviewQuery.prefetch(false);
}

export function invalidateJobsOverview() {
  jobsOverviewQuery.invalidate({ revalidate: true });
}

export function useJobsOverview(enabled = true) {
  return useClientQuery(jobsOverviewQuery, { enabled });
}
