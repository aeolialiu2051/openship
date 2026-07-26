"use client";

import { useEffect, useState } from "react";
import { projectsApi } from "@/lib/api";
import type { Project } from "@/constants/mock";

export interface OtherOrgHint {
  organizationId: string;
  name: string;
  projectCount: number;
}

export interface ProjectsHomeData {
  success: boolean;
  projects: Project[];
  numbers: Record<string, number>;
  otherOrgs: OtherOrgHint[];
}

const CACHE_TTL_MS = 30_000;
const EMPTY_DATA: ProjectsHomeData = {
  success: true,
  projects: [],
  numbers: {},
  otherOrgs: [],
};

let cachedData: ProjectsHomeData | null = null;
let cachedAt = 0;
let inFlight: Promise<ProjectsHomeData> | null = null;
const subscribers = new Set<(data: ProjectsHomeData) => void>();

function normalizeProjectsHome(data: any): ProjectsHomeData {
  return {
    success: data?.success !== false,
    projects: Array.isArray(data?.projects) ? data.projects : [],
    numbers: data?.numbers && typeof data.numbers === "object" ? data.numbers : {},
    otherOrgs: Array.isArray(data?.otherOrgs) ? data.otherOrgs : [],
  };
}

function publish(data: ProjectsHomeData) {
  cachedData = data;
  cachedAt = Date.now();
  subscribers.forEach((subscriber) => subscriber(data));
}

async function fetchProjectsHome(force = false): Promise<ProjectsHomeData> {
  if (!force && cachedData && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedData;
  }
  if (inFlight) return inFlight;

  inFlight = projectsApi
    .getHome()
    .then((response) => {
      const data = normalizeProjectsHome(response);
      publish(data);
      return data;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function prefetchProjectsHome() {
  return fetchProjectsHome(false);
}

/** Mark the cache stale after a project mutation while keeping its current
 * value available for an instant transition. Revalidate immediately so a
 * subsequent navigation does not spend up to the full TTL showing stale data. */
export function invalidateProjectsHomeCache() {
  cachedAt = 0;
  // If an older list request is still in flight, let it settle and then issue
  // a new request. Reusing that pre-mutation response would make stale data
  // look fresh for another full TTL.
  const pending = inFlight;
  void (pending ? pending.catch(() => undefined) : Promise.resolve())
    .then(() => fetchProjectsHome(true))
    .catch(() => {});
}

export function useProjectsHome(initialData?: any) {
  const normalizedInitial = initialData ? normalizeProjectsHome(initialData) : null;
  const [data, setData] = useState<ProjectsHomeData>(
    () => normalizedInitial ?? cachedData ?? EMPTY_DATA,
  );
  const [isLoading, setIsLoading] = useState(
    () => !normalizedInitial && !cachedData,
  );

  useEffect(() => {
    const handleUpdate = (next: ProjectsHomeData) => {
      setData(next);
      setIsLoading(false);
    };
    subscribers.add(handleUpdate);

    if (normalizedInitial) {
      publish(normalizedInitial);
      setData(normalizedInitial);
      setIsLoading(false);
    } else if (cachedData) {
      setData(cachedData);
      setIsLoading(false);
      if (Date.now() - cachedAt >= CACHE_TTL_MS) {
        void fetchProjectsHome(true).catch(() => {});
      }
    } else {
      setIsLoading(true);
      void fetchProjectsHome(true).catch(() => setIsLoading(false));
    }

    return () => {
      subscribers.delete(handleUpdate);
    };
  }, [initialData]);

  const refresh = async () => {
    const next = await fetchProjectsHome(true);
    setData(next);
    setIsLoading(false);
    return next;
  };

  return { ...data, isLoading, refresh };
}
