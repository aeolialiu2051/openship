import { ApiError, getApiErrorCode } from "./client";

export const CUSTOM_DOMAIN_PROJECT_LIMIT_ERROR_CODE = "CUSTOM_DOMAIN_PROJECT_LIMIT_REACHED";

export interface CustomDomainProjectLimitCopy {
  projectLimitTitle: string;
  projectLimitDescription: string;
}

export interface LocalizedCustomDomainProjectLimitError {
  title: string;
  message: string;
}

/**
 * Maps the custom-domain project entitlement error to the active UI locale.
 *
 * The API message is intentionally English-only diagnostic text. User-facing
 * clients must key off the stable code and interpolate structured details so a
 * stale quota query cannot leak that diagnostic message into the interface.
 */
export function getLocalizedCustomDomainProjectLimitError(
  err: unknown,
  copy: CustomDomainProjectLimitCopy,
  fallbackProjectName = "",
): LocalizedCustomDomainProjectLimitError | null {
  if (getApiErrorCode(err) !== CUSTOM_DOMAIN_PROJECT_LIMIT_ERROR_CODE) {
    return null;
  }

  const body =
    err instanceof ApiError ? (err.body as Record<string, unknown> | undefined) : undefined;
  const details = body?.details;
  const claimedProjectName =
    details && typeof details === "object" && !Array.isArray(details)
      ? (details as Record<string, unknown>).claimedProjectName
      : undefined;
  const projectName =
    typeof claimedProjectName === "string" && claimedProjectName.trim()
      ? claimedProjectName.trim()
      : fallbackProjectName.trim() || "—";

  return {
    title: copy.projectLimitTitle,
    message: copy.projectLimitDescription.replace(/\{project\}/g, projectName),
  };
}
