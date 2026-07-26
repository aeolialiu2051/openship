"use client";

import { systemApi } from "@/lib/api";
import type { ServerInfo } from "@/lib/api/system";
import { createClientQuery, useClientQuery } from "@/lib/client-query-cache";

const serversListQuery = createClientQuery<ServerInfo[]>(
  () => systemApi.listServers(),
  { ttlMs: 30_000 },
);

export function prefetchServersList() {
  return serversListQuery.prefetch(false);
}

export function invalidateServersList() {
  serversListQuery.invalidate({ revalidate: true });
}

export function useServersList() {
  return useClientQuery(serversListQuery);
}
