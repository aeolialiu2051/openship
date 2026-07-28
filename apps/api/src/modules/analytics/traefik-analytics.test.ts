import { describe, expect, it } from "vitest";
import { buildTraefikAnalyticsOverview } from "./analytics.service";
import {
  parseTraefikAccessLog,
  type TraefikRequestLog,
} from "../projects/traefik-access-logs";

function request(overrides: Partial<TraefikRequestLog> = {}): TraefikRequestLog {
  return {
    id: "request",
    timestamp: "2026-07-28T01:10:00.000Z",
    ip: "203.0.113.10",
    method: "GET",
    path: "/",
    statusCode: 200,
    userAgent: "test",
    responseTime: 0.125,
    requestSize: 100,
    responseSize: 900,
    ...overrides,
  };
}

describe("buildTraefikAnalyticsOverview", () => {
  it("only parses access logs for the requested domain", () => {
    const entry = {
      timestamp: "2026-07-28T01:10:00.000Z",
      message: JSON.stringify({
        RequestHost: "api.example.com",
        RequestMethod: "GET",
        RequestPath: "/health",
        ClientHost: "203.0.113.10",
        DownstreamStatus: 200,
        Duration: 4_000_000,
      }),
    };

    expect(parseTraefikAccessLog(entry, "api.example.com")).not.toBeNull();
    expect(parseTraefikAccessLog(entry, "other.example.com")).toBeNull();
  });

  it("aggregates requests, unique visitors, bandwidth and response time", () => {
    const result = buildTraefikAnalyticsOverview(
      [
        request(),
        request({ id: "second", timestamp: "2026-07-28T01:40:00.000Z", path: "/health" }),
        request({
          id: "third",
          timestamp: "2026-07-28T02:05:00.000Z",
          ip: "203.0.113.11",
          responseTime: 0.075,
          requestSize: 50,
          responseSize: 450,
        }),
      ],
      Date.parse("2026-07-28T01:00:00.000Z"),
      Date.parse("2026-07-28T02:59:59.999Z"),
    );

    expect(result.summary).toMatchObject({
      totalRequests: 3,
      uniqueVisitors: 2,
      bandwidthIn: 250,
      bandwidthOut: 2250,
      avgResponseTimeMs: 108,
      lastUpdated: "2026-07-28T02:05:00.000Z",
    });
    expect(result.periods).toHaveLength(2);
    expect(result.periods[0]).toMatchObject({ requests: 2, uniqueVisitors: 1 });
    expect(result.periods[0]?.topPaths).toEqual([
      { path: "/", count: 1 },
      { path: "/health", count: 1 },
    ]);
    expect(result.periods[1]).toMatchObject({ requests: 1, uniqueVisitors: 1 });
  });

  it("ignores logs outside the requested time range", () => {
    const result = buildTraefikAnalyticsOverview(
      [request({ timestamp: "2026-07-27T23:59:59.000Z" })],
      Date.parse("2026-07-28T00:00:00.000Z"),
      Date.parse("2026-07-28T23:59:59.999Z"),
    );

    expect(result.summary.totalRequests).toBe(0);
    expect(result.periods).toEqual([]);
  });
});
