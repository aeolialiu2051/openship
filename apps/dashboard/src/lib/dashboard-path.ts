const configuredBasePath =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_DASHBOARD_BASE_PATH?.trim()
    : undefined;

/** Build-time mount point for the hosted Dashboard. Empty in VPS/Desktop builds. */
export const DASHBOARD_BASE_PATH = configuredBasePath
  ? `/${configuredBasePath.replace(/^\/+|\/+$/g, "")}`
  : "";

export function withDashboardBasePath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  if (!DASHBOARD_BASE_PATH) return path;
  if (path === DASHBOARD_BASE_PATH || path.startsWith(`${DASHBOARD_BASE_PATH}/`)) return path;
  return path === "/" ? DASHBOARD_BASE_PATH : `${DASHBOARD_BASE_PATH}${path}`;
}

export function withoutDashboardBasePath(path: string): string {
  if (!DASHBOARD_BASE_PATH) return path;
  if (path === DASHBOARD_BASE_PATH) return "/";
  if (path.startsWith(`${DASHBOARD_BASE_PATH}/`)) {
    return path.slice(DASHBOARD_BASE_PATH.length) || "/";
  }
  return path;
}

export function dashboardUrl(origin: string, path = "/"): string {
  return new URL(withDashboardBasePath(path), origin).toString();
}
