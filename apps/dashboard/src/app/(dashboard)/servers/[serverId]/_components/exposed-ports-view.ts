export function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

/**
 * An already-open tab can briefly retain the pre-deploy SSR dictionary while
 * loading a newer component chunk. Fall back to the long-lived section title
 * so a newly-added translation key can never crash the whole dashboard.
 */
export function formatPortDetailsLabel(
  labels: Record<string, string | undefined>,
  count: number,
): string {
  const template = labels.portDetails || `${labels.title || "Port details"} ({count})`;
  return template.replace(/\{count\}/g, String(count));
}
