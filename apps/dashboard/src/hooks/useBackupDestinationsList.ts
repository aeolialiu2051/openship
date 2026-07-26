"use client";

import {
  backupDestinationsApi,
  type BackupDestinationSummary,
} from "@/lib/api";
import { createClientQuery, useClientQuery } from "@/lib/client-query-cache";

const backupDestinationsQuery = createClientQuery<BackupDestinationSummary[]>(
  async () => (await backupDestinationsApi.list()).data,
  { ttlMs: 30_000 },
);

export function prefetchBackupDestinationsList() {
  return backupDestinationsQuery.prefetch(false);
}

export function invalidateBackupDestinationsList() {
  backupDestinationsQuery.invalidate({ revalidate: true });
}

export function useBackupDestinationsList() {
  return useClientQuery(backupDestinationsQuery);
}
