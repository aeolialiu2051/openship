import { describe, expect, it } from "vitest";

import { applyRequestedPublicService } from "../../../src/modules/deployments/compose/public-service";

const project = { name: "Demo Stack", slug: "demo-stack" };

describe("applyRequestedPublicService", () => {
  const services = [
    {
      name: "web",
      image: "nginx:alpine",
      ports: ["0.0.0.0:8080:80"],
      dependsOn: ["postgres"],
      environment: {},
      volumes: [],
    },
    {
      name: "postgres",
      image: "postgres:18-alpine",
      ports: [],
      dependsOn: [],
      environment: {},
      volumes: [],
    },
  ];

  it("exposes only the explicitly selected service on its container port", () => {
    const result = applyRequestedPublicService(services, project, "web");

    expect(result[0]).toEqual(
      expect.objectContaining({
        exposed: true,
        exposedPort: "80",
        domain: "demo-stack",
        domainType: "free",
        publicEndpoints: [{ port: 80, domain: "demo-stack", domainType: "free" }],
      }),
    );
    expect(result[1]).toEqual(services[1]);
  });

  it("accepts an explicit container port", () => {
    const result = applyRequestedPublicService(services, project, "web", "8081");
    expect(result[0]?.exposedPort).toBe("8081");
    expect(result[0]?.publicEndpoints?.[0]?.port).toBe(8081);
  });

  it("rejects an unknown service instead of silently deploying privately", () => {
    expect(() => applyRequestedPublicService(services, project, "api")).toThrow(
      'Public service "api" was not found',
    );
  });

  it("rejects a selected service with no routable port", () => {
    expect(() => applyRequestedPublicService(services, project, "postgres")).toThrow(
      "has no declared container port",
    );
  });
});
