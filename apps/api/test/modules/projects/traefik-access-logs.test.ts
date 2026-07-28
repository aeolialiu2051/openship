import { describe, expect, it } from "vitest";
import { parseTraefikAccessLog } from "../../../src/modules/projects/traefik-access-logs";

describe("parseTraefikAccessLog", () => {
  it("normalizes a matching Traefik JSON access log", () => {
    expect(
      parseTraefikAccessLog(
        {
          timestamp: "2026-07-28T10:00:00.000Z",
          message: JSON.stringify({
            ClientHost: "203.0.113.8",
            RequestHost: "www.example.com",
            RequestMethod: "GET",
            RequestPath: "/health",
            DownstreamStatus: 204,
            Duration: 12_500_000,
            RequestContentSize: 10,
            DownstreamContentSize: 20,
            RequestUserAgent: "test-agent",
            RequestCount: 7,
            StartUTC: "2026-07-28T10:00:00.000Z",
          }),
        },
        "example.com",
      ),
    ).toMatchObject({
      ip: "203.0.113.8",
      method: "GET",
      path: "/health",
      statusCode: 204,
      responseTime: 0.0125,
      requestSize: 10,
      responseSize: 20,
    });
  });

  it("ignores another host and regular Traefik log output", () => {
    expect(
      parseTraefikAccessLog(
        { timestamp: "now", message: JSON.stringify({ RequestHost: "other.test" }) },
        "example.com",
      ),
    ).toBeNull();
    expect(
      parseTraefikAccessLog({ timestamp: "now", message: "level=info msg=started" }, "example.com"),
    ).toBeNull();
  });
});
