"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { interpolate, useI18n } from "@/components/i18n-provider";
import { useToast } from "@/context/ToastContext";
import { ApiError } from "@/lib/api/client";
import { operationsApi, projectsApi } from "@/lib/api";
import type { ResourceOperationView } from "@/lib/api/operations";
import { invalidateProjectsHomeCache } from "@/hooks/useProjectsHome";

const STORAGE_KEY = "openship:project-deletions";
const POLL_INTERVAL_MS = 2_000;

interface TrackedProjectDeletion {
  operationId: string;
  projectId: string;
  deleteApp: boolean;
}

interface ProjectDeletionContextValue {
  trackProjectDeletion: (deletion: TrackedProjectDeletion) => void;
}

const ProjectDeletionContext = createContext<ProjectDeletionContextValue | null>(null);

function readTrackedDeletions(): Record<string, TrackedProjectDeletion> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return {};
    return Object.fromEntries(
      parsed
        .filter(
          (item): item is TrackedProjectDeletion =>
            !!item &&
            typeof item.operationId === "string" &&
            typeof item.projectId === "string" &&
            typeof item.deleteApp === "boolean",
        )
        .map((item) => [item.operationId, item]),
    );
  } catch {
    return {};
  }
}

export function ProjectDeletionProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [tracked, setTracked] = useState<Record<string, TrackedProjectDeletion>>(
    readTrackedDeletions,
  );

  const trackProjectDeletion = useCallback((deletion: TrackedProjectDeletion) => {
    setTracked((current) => ({
      ...current,
      [deletion.operationId]: deletion,
    }));
  }, []);

  useEffect(() => {
    try {
      const values = Object.values(tracked);
      if (values.length === 0) sessionStorage.removeItem(STORAGE_KEY);
      else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch {
      /* storage unavailable — in-memory tracking still works */
    }
  }, [tracked]);

  useEffect(() => {
    const deletions = Object.values(tracked);
    if (deletions.length === 0) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const forget = (operationId: string) => {
      setTracked((current) => {
        if (!current[operationId]) return current;
        const next = { ...current };
        delete next[operationId];
        return next;
      });
    };

    const notifyCompleted = (
      operation: ResourceOperationView,
      deletion: TrackedProjectDeletion,
    ) => {
      const orphanCount = operation.result?.orphaned?.length ?? 0;
      const failureCount = operation.result?.unrecoverable?.length ?? 0;
      if (orphanCount > 0) {
        showToast(
          interpolate(t.projects.delete.orphanCleanup, { count: String(orphanCount) }),
          "success",
          t.projects.delete.orphanCleanupTitle,
        );
      } else if (failureCount > 0) {
        showToast(
          interpolate(t.projects.delete.partialCleanup, { count: String(failureCount) }),
          "success",
          t.projects.delete.partialCleanupTitle,
        );
      } else {
        showToast(
          deletion.deleteApp
            ? t.projects.delete.successProject
            : t.projects.delete.successEnvironment,
          "success",
        );
      }
      invalidateProjectsHomeCache();
    };

    const poll = async () => {
      await Promise.all(
        deletions.map(async (deletion) => {
          try {
            const operation = (await operationsApi.get(deletion.operationId)).data;
            if (cancelled) return;

            if (
              operation.status === "completed" ||
              operation.status === "completed_with_warnings"
            ) {
              notifyCompleted(operation, deletion);
              forget(deletion.operationId);
              return;
            }

            if (operation.status === "failed") {
              showToast(
                operation.error?.message || t.projects.delete.failed,
                "error",
                t.projects.delete.cleanupFailedTitle,
              );
              forget(deletion.operationId);
              return;
            }

            if (operation.status === "needs_action") {
              const reasons = (operation.result?.unrecoverable ?? [])
                .map((item) => item.step)
                .join(", ");
              showToast(
                reasons
                  ? interpolate(t.projects.delete.teardownFailedAt, { reasons })
                  : operation.error?.message || t.projects.delete.teardownFailed,
                "error",
                t.projects.delete.cleanupFailedTitle,
              );
              forget(deletion.operationId);
            }
          } catch (err) {
            if (cancelled) return;
            if (err instanceof ApiError && err.status === 404) {
              try {
                await projectsApi.getInfo(deletion.projectId);
                showToast(
                  t.projects.delete.failed,
                  "error",
                  t.projects.delete.cleanupFailedTitle,
                );
              } catch (projectErr) {
                if (projectErr instanceof ApiError && projectErr.status === 404) {
                  showToast(
                    deletion.deleteApp
                      ? t.projects.delete.successProject
                      : t.projects.delete.successEnvironment,
                    "success",
                  );
                  invalidateProjectsHomeCache();
                } else {
                  return;
                }
              }
              forget(deletion.operationId);
            }
          }
        }),
      );

      if (!cancelled) timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [showToast, t, tracked]);

  const value = useMemo(
    () => ({ trackProjectDeletion }),
    [trackProjectDeletion],
  );

  return (
    <ProjectDeletionContext.Provider value={value}>
      {children}
    </ProjectDeletionContext.Provider>
  );
}

export function useProjectDeletionTracker() {
  const context = useContext(ProjectDeletionContext);
  if (!context) {
    throw new Error("useProjectDeletionTracker must be used within ProjectDeletionProvider");
  }
  return context;
}
