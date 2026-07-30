import { describe, expect, it } from "vitest";
import { sanitizeSpec } from "./route-rule.controller";

describe("sanitizeSpec", () => {
  it("keeps supported Traefik middleware fields and validates IP ranges", () => {
    expect(
      sanitizeSpec({
        rateLimit: { rps: 10.9, burst: 20.5, status: 503 },
        ipAllowList: {
          sourceRange: ["203.0.113.10", "10.0.0.0/8", "2001:db8::/32", "invalid", "10.0.0.0/99"],
        },
        inFlightReq: { amount: 75.8 },
      }),
    ).toEqual({
      rateLimit: { rps: 10, burst: 20, key: "ip" },
      ipAllowList: { sourceRange: ["203.0.113.10", "10.0.0.0/8", "2001:db8::/32"] },
      inFlightReq: { amount: 75 },
    });
  });

  it("discards legacy Traefik-only fields", () => {
    expect(
      sanitizeSpec({
        ban: { ips: ["203.0.113.10"] },
        access: { methods: ["GET"], denyCidrs: ["10.0.0.0/8"] },
        hotlink: { allowReferers: ["example.com"] },
        block: { status: 403 },
      }),
    ).toEqual({});
  });
});
