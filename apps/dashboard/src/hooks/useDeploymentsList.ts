"use client";

import { deployApi } from "@/lib/api";
import { createClientQuery, useClientQuery } from "@/lib/client-query-cache";

type DeploymentsListResponse = { data?: unknown[] } & Record<string, unknown>;

const deploymentsListQuery = createClientQuery<DeploymentsListResponse>(
  () => deployApi.getAll({ perPage: 100 }) as Promise<DeploymentsListResponse>,
  { ttlMs: 15_000 },
);

export function prefetchDeploymentsList() {
  return deploymentsListQuery.prefetch(false);
}

export function invalidateDeploymentsList() {
  deploymentsListQuery.invalidate({ revalidate: true });
}

export function useDeploymentsList(enabled = true) {
  return useClientQuery(deploymentsListQuery, { enabled });
}
