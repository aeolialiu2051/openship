"use client";

import { useCallback, useEffect, useState } from "react";

export interface ClientQuerySnapshot<T> {
  data: T | undefined;
  isFetching: boolean;
  error: unknown;
  updatedAt: number;
}

export interface ClientQuery<T> {
  getSnapshot: () => ClientQuerySnapshot<T>;
  prefetch: (force?: boolean) => Promise<T>;
  setData: (data: T) => void;
  invalidate: (options?: { revalidate?: boolean }) => void;
  subscribe: (listener: (snapshot: ClientQuerySnapshot<T>) => void) => () => void;
}

/**
 * Tiny module-scoped stale-while-revalidate cache for dashboard route data.
 * It intentionally mirrors the successful projects/home cache without adding
 * a large query-library dependency to the shared shell.
 */
export function createClientQuery<T>(
  loader: () => Promise<T>,
  options: { ttlMs?: number } = {},
): ClientQuery<T> {
  const ttlMs = options.ttlMs ?? 30_000;
  let snapshot: ClientQuerySnapshot<T> = {
    data: undefined,
    isFetching: false,
    error: null,
    updatedAt: 0,
  };
  let inFlight: Promise<T> | null = null;
  const listeners = new Set<(next: ClientQuerySnapshot<T>) => void>();

  const publish = (patch: Partial<ClientQuerySnapshot<T>>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener(snapshot));
  };

  const setData = (data: T) => {
    publish({ data, error: null, isFetching: false, updatedAt: Date.now() });
  };

  const prefetch = (force = false): Promise<T> => {
    const fresh = snapshot.data !== undefined && Date.now() - snapshot.updatedAt < ttlMs;
    if (!force && fresh) return Promise.resolve(snapshot.data as T);
    if (inFlight) return inFlight;

    publish({ isFetching: true, error: null });
    const work = loader()
      .then((data) => {
        setData(data);
        return data;
      })
      .catch((error) => {
        publish({ error, isFetching: false });
        throw error;
      })
      .finally(() => {
        if (inFlight === work) inFlight = null;
      });
    inFlight = work;
    return work;
  };

  return {
    getSnapshot: () => snapshot,
    prefetch,
    setData,
    invalidate: ({ revalidate = false } = {}) => {
      snapshot = { ...snapshot, updatedAt: 0 };
      if (revalidate) void prefetch(true).catch(() => {});
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useClientQuery<T>(
  query: ClientQuery<T>,
  options: { enabled?: boolean; initialData?: T } = {},
) {
  const enabled = options.enabled ?? true;
  const [snapshot, setSnapshot] = useState(() => query.getSnapshot());

  useEffect(() => query.subscribe(setSnapshot), [query]);

  useEffect(() => {
    if (options.initialData !== undefined) query.setData(options.initialData);
  }, [options.initialData, query]);

  useEffect(() => {
    if (!enabled) return;
    const current = query.getSnapshot();
    const hasData = current.data !== undefined;
    void query.prefetch(false).catch(() => {});
    // `prefetch` itself decides whether this is a fresh-cache no-op. Existing
    // data remains visible while stale data revalidates in the background.
    if (hasData) setSnapshot(current);
  }, [enabled, query]);

  const refresh = useCallback(() => query.prefetch(true), [query]);
  const invalidate = useCallback(
    (options?: { revalidate?: boolean }) => query.invalidate(options),
    [query],
  );

  return {
    data: snapshot.data,
    error: snapshot.error,
    isLoading: enabled && snapshot.data === undefined && snapshot.isFetching,
    isFetching: enabled && snapshot.isFetching,
    refresh,
    invalidate,
  };
}
