import { ApiError, getApiErrorCode } from "./client";

export const PROJECT_LIMIT_REACHED_ERROR_CODE = "PROJECT_LIMIT_REACHED";

export interface ProjectLimitCopy {
  errorTitle: string;
  limitReached: string;
}

export interface LocalizedProjectLimitError {
  title: string;
  message: string;
}

/** Map the project quota API error to the active dashboard locale. */
export function getLocalizedProjectLimitError(
  err: unknown,
  copy: ProjectLimitCopy,
): LocalizedProjectLimitError | null {
  if (getApiErrorCode(err) !== PROJECT_LIMIT_REACHED_ERROR_CODE) return null;

  const body =
    err instanceof ApiError ? (err.body as Record<string, unknown> | undefined) : undefined;
  const details = body?.details;
  const limit =
    details && typeof details === "object" && !Array.isArray(details)
      ? (details as Record<string, unknown>).limit
      : undefined;
  const displayLimit =
    typeof limit === "number" || typeof limit === "string" ? String(limit) : "—";

  return {
    title: copy.errorTitle,
    message: copy.limitReached.replace(/\{limit\}/g, displayLimit),
  };
}
