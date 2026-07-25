import { describe, expect, it } from "vitest";
import type { DeploymentConfig } from "./types";
import {
  canonicalizeDeploymentRouteKey,
  managedDomainForApi,
} from "./project-route-key";

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
