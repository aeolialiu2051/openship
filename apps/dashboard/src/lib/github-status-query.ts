"use client";

import { githubApi } from "./api/github";
import { createClientQuery } from "./client-query-cache";

export interface GitHubStatusResponse {
  state?: unknown;
  accounts?: unknown[];
  installUrl?: string | null;
}

export const GITHUB_STATUS_TTL_MS = 30_000;

export function createGitHubStatusQuery<T = GitHubStatusResponse>(
  loader: () => Promise<T> = () => githubApi.getStatusDeduped<T>(),
) {
  return createClientQuery(loader, { ttlMs: GITHUB_STATUS_TTL_MS });
}

/**
 * Retains the last successful status while every Settings mount refreshes it
 * in the background. Mutations use a forced refresh through the same query.
 */
export const githubStatusQuery = createGitHubStatusQuery();

export function revalidateGitHubStatus(): void {
  githubStatusQuery.invalidate({ revalidate: true });
}

export function refreshGitHubStatus() {
  githubApi.invalidateStatus();
  githubStatusQuery.invalidate();
  return githubStatusQuery.prefetch(true);
}
