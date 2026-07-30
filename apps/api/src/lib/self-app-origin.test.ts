import { describe, expect, it } from "vitest";
import { selfAppManagedOrigin } from "./self-app-origin";

describe("selfAppManagedOrigin", () => {
  it("targets the adopted dashboard port instead of an unavailable local route", () => {
    expect(selfAppManagedOrigin("203.0.113.10", 3001)).toBe("203.0.113.10:3001");
  });

  it("normalizes a schemed host and validates the port", () => {
    expect(selfAppManagedOrigin("https://panel.example.com/", 4100)).toBe("panel.example.com:4100");
    expect(selfAppManagedOrigin("[2001:db8::1]", 4100)).toBe("[2001:db8::1]:4100");
    expect(() => selfAppManagedOrigin("panel.example.com", 0)).toThrow();
  });
});
