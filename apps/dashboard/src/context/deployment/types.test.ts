import { describe, expect, it } from "vitest";
import { inferDefaultServiceExposure, normalizeComposeService } from "./types";

describe("normalizeComposeService", () => {
  it("enables a newly detected API on a common HTTP port", () => {
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

describe("inferDefaultServiceExposure", () => {
  it.each([
    { name: "db", image: "ankane/pgvector", ports: ["5432"] },
    { name: "postgres", image: "postgres:16-alpine", ports: ["5432:5432"] },
    { name: "cache", image: "redis:7-alpine", ports: ["6379"] },
    { name: "queue", image: "rabbitmq:3-management", ports: ["5672", "15672"] },
    { name: "search", image: "elasticsearch:8", ports: ["9200"] },
  ])("keeps infrastructure service $name internal", (service) => {
    expect(inferDefaultServiceExposure(service)).toBe(false);
  });

  it.each([
    { name: "api", image: "fastapi-template:latest", ports: ["8000"] },
    { name: "frontend", image: "node:22", ports: ["3000"] },
    { name: "site", image: "nginx:alpine", ports: ["80:80"] },
    { name: "backend", image: "custom/image", ports: ["8080"] },
  ])("enables high-confidence web service $name", (service) => {
    expect(inferDefaultServiceExposure(service)).toBe(true);
  });

  it("keeps an unknown service on an uncommon port internal", () => {
    expect(
      inferDefaultServiceExposure({ name: "worker", image: "custom/image", ports: ["7001"] }),
    ).toBe(false);
  });

  it("lets infrastructure evidence override a web-like service name", () => {
    expect(
      inferDefaultServiceExposure({ name: "api", image: "postgres:16", ports: ["5432"] }),
    ).toBe(false);
  });

  it("preserves explicit exposure choices", () => {
    expect(inferDefaultServiceExposure({ name: "db", ports: ["5432"], exposed: true })).toBe(true);
    expect(inferDefaultServiceExposure({ name: "web", ports: ["3000"], exposed: false })).toBe(false);
  });
});
