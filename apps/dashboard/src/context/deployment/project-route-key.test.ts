import { describe, expect, it } from "vitest";
import type { DeploymentConfig } from "./types";
import {
  canonicalizeDeploymentRouteKey,
  managedDomainForApi,
  managedDomainForEditing,
  managedDomainFromEditing,
} from "./project-route-key";

describe("managed domain editing", () => {
  it("separates the immutable route key from the editable label", () => {
    expect(managedDomainForEditing(
      "seekpeace-backend-1lci64",
      "free",
      "1lci64",
      "vibrail.warpgateapi.com",
    )).toBe("seekpeace-backend");
    expect(managedDomainFromEditing(
      "renamed-backend",
      "free",
      "1lci64",
      "vibrail.warpgateapi.com",
    )).toBe("renamed-backend-1lci64");
  });

  it("keeps the key when the editable label is cleared", () => {
    expect(managedDomainFromEditing(
      "",
      "free",
      "1lci64",
      "vibrail.warpgateapi.com",
    )).toBe("project-1lci64");
  });

  it("accepts a keyed label or full managed hostname without duplicating suffixes", () => {
    expect(managedDomainFromEditing(
      "renamed-1lci64",
      "free",
      "1lci64",
      "vibrail.warpgateapi.com",
    )).toBe("renamed-1lci64");
    expect(managedDomainFromEditing(
      "renamed-1lci64.vibrail.warpgateapi.com",
      "free",
      "1lci64",
      "vibrail.warpgateapi.com",
    )).toBe("renamed-1lci64");
  });

  it("does not rewrite custom domains", () => {
    expect(managedDomainForEditing(
      "app.example.com",
      "custom",
      "1lci64",
      "vibrail.warpgateapi.com",
    )).toBe("app.example.com");
    expect(managedDomainFromEditing(
      "app.example.com",
      "custom",
      "1lci64",
      "vibrail.warpgateapi.com",
    )).toBe("app.example.com");
  });

  it("preserves the full key at the DNS label length limit", () => {
    const domain = managedDomainFromEditing("a".repeat(80), "free", "1lci64");
    expect(domain).toHaveLength(63);
    expect(domain.endsWith("-1lci64")).toBe(true);
  });
});

describe("deployment route key handoff", () => {
  it("sends raw managed labels to the API while leaving custom domains unchanged", () => {
    expect(managedDomainForApi("seekpeace-db-aaaaaa", "free", "aaaaaa"))
      .toBe("seekpeace-db");
    expect(managedDomainForApi("db.example.com", "custom", "aaaaaa"))
      .toBe("db.example.com");
  });

  it("replaces a preview key with the canonical key across deployment state", () => {
    const config = {
      routeKey: "aaaaaa",
      publicEndpoints: [{
        id: "endpoint-project",
        port: "3000",
        targetPath: "",
        domain: "seekpeace-aaaaaa",
        customDomain: "",
        domainType: "free",
      }],
      services: [{
        name: "db",
        ports: ["5432"],
        dependsOn: [],
        environment: {},
        volumes: [],
        domain: "seekpeace-db-aaaaaa",
        domainType: "free" as const,
        publicEndpoints: [{
          id: "endpoint-db",
          port: "5432",
          targetPath: "",
          domain: "seekpeace-db-aaaaaa",
          customDomain: "",
          domainType: "free",
        }],
      }],
    } as unknown as DeploymentConfig;

    const canonical = canonicalizeDeploymentRouteKey(config, "bbbbbb");
    expect(canonical.routeKey).toBe("bbbbbb");
    expect(canonical.publicEndpoints[0]?.domain).toBe("seekpeace-bbbbbb");
    expect(canonical.services[0]?.domain).toBe("seekpeace-db-bbbbbb");
    expect(canonical.services[0]?.publicEndpoints?.[0]?.domain)
      .toBe("seekpeace-db-bbbbbb");
  });

  it("removes a preview key when ensure resolves to a legacy unsuffixed project", () => {
    const config = {
      routeKey: "aaaaaa",
      publicEndpoints: [{
        id: "endpoint-project",
        port: "3000",
        targetPath: "",
        domain: "seekpeace-aaaaaa",
        customDomain: "",
        domainType: "free",
      }],
      services: [],
    } as unknown as DeploymentConfig;

    const canonical = canonicalizeDeploymentRouteKey(config, undefined);
    expect(canonical.routeKey).toBeUndefined();
    expect(canonical.publicEndpoints[0]?.domain).toBe("seekpeace");
  });
});
