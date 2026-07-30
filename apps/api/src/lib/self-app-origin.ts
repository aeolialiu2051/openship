export function selfAppManagedOrigin(host: string, dashboardPort: number): string {
  let normalizedHost = host
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
  if (
    !normalizedHost ||
    !Number.isInteger(dashboardPort) ||
    dashboardPort <= 0 ||
    dashboardPort > 65_535
  ) {
    throw new Error("Invalid self-app managed origin");
  }
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(normalizedHost);
  if (bracketed) {
    normalizedHost = `[${bracketed[1]}]`;
  } else if ((normalizedHost.match(/:/g) ?? []).length === 1 && /:\d+$/.test(normalizedHost)) {
    normalizedHost = normalizedHost.replace(/:\d+$/, "");
  } else if (normalizedHost.includes(":")) {
    normalizedHost = `[${normalizedHost}]`;
  }
  return `${normalizedHost}:${dashboardPort}`;
}
