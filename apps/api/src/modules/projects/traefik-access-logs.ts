import type { LogEntry } from "@repo/adapters";

export interface TraefikRequestLog {
  id: string;
  timestamp: string;
  ip: string;
  method: string;
  path: string;
  statusCode: number;
  userAgent: string;
  /** Seconds; the dashboard normalizer converts this to milliseconds. */
  responseTime: number;
  requestSize: number;
  responseSize: number;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedHost(value: unknown): string {
  return stringValue(value)
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/:\d+$/, "");
}

/** Parse one JSON access-log line emitted by Traefik. Non-access-log lines
 * (startup messages, certificate notices, malformed output) are ignored. */
export function parseTraefikAccessLog(
  entry: Pick<LogEntry, "message" | "timestamp">,
  domain: string,
): TraefikRequestLog | null {
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(entry.message) as Record<string, unknown>;
  } catch {
    return null;
  }

  const requestHost = normalizedHost(value.RequestHost ?? value.requestHost ?? value.Host);
  if (!requestHost || requestHost !== normalizedHost(domain)) return null;

  const method = stringValue(value.RequestMethod ?? value.requestMethod ?? value.method);
  const path = stringValue(value.RequestPath ?? value.requestPath ?? value.path);
  if (!method || !path) return null;

  const timestamp = stringValue(value.StartUTC ?? value.startUTC ?? value.time) || entry.timestamp;
  const durationNs = numberValue(value.Duration ?? value.duration);
  const requestCount = numberValue(value.RequestCount ?? value.requestCount);

  return {
    id: `traefik-${requestCount || timestamp}-${method}-${path}`,
    timestamp,
    ip:
      stringValue(value.ClientHost ?? value.clientHost ?? value.ClientAddr).replace(/:\d+$/, "") ||
      "-",
    method,
    path,
    statusCode: numberValue(value.DownstreamStatus ?? value.downstreamStatus ?? value.status),
    userAgent: stringValue(value.RequestUserAgent ?? value.requestUserAgent ?? value.UserAgent),
    responseTime: durationNs > 0 ? durationNs / 1_000_000_000 : 0,
    requestSize: numberValue(value.RequestContentSize ?? value.requestContentSize),
    responseSize: numberValue(value.DownstreamContentSize ?? value.downstreamContentSize),
  };
}
