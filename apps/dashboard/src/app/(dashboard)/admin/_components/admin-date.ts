const TIME_ZONE_SUFFIX = /(?:z|[+-]\d{2}(?::?\d{2})?)$/i;

/**
 * Admin timestamps are stored as UTC. Raw SQL projections from older API
 * versions may omit the trailing `Z`, which JavaScript would otherwise treat
 * as browser-local wall time. Normalize those values to an explicit UTC ISO
 * timestamp before formatting them in the browser's current time zone.
 */
export function parseAdminDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = TIME_ZONE_SUFFIX.test(trimmed)
    ? trimmed
    : `${trimmed.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}
