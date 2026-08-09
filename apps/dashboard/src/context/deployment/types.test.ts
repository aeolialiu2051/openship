import { describe, expect, it } from "vitest";
import { normalizeComposeService } from "./types";

describe("normalizeComposeService", () => {
  it("enables a newly detected service with a public port by default", () => {
    expect(normalizeComposeService({ name: "api", ports: ["8000"] }).exposed).toBe(true);
  });

  it("keeps portless services internal by default", () => {
    expect(normalizeComposeService({ name: "db", ports: [] }).exposed).toBe(false);
  });

  it("preserves an explicit opt-out for a service with ports", () => {
    expect(
      normalizeComposeService({ name: "api", ports: ["8000"], exposed: false }).exposed,
    ).toBe(false);
  });
});
