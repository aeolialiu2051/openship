import { describe, expect, it } from "vitest";
import type { Service } from "@/lib/api/services";
import {
  projectContainerPort,
  projectHostPort,
  serviceContainerPort,
  serviceHostPort,
} from "./project-display-port";

function service(ports: string[], exposedPort: string | null = null): Service {
  return {
    id: "svc_1",
    name: "app",
    image: "example/app",
    build: null,
    dockerfile: null,
    ports,
    dependsOn: [],
    environment: {},
    volumes: [],
    command: null,
    restart: null,
    exposed: false,
    exposedPort,
    domain: null,
    customDomain: null,
    domainType: null,
    enabled: true,
    sortOrder: 0,
  };
}

describe("project display ports", () => {
  it("uses the compose service port instead of the legacy project default", () => {
    expect(projectContainerPort([service(["3001:3001"])], 3000)).toBe(3001);
    expect(projectHostPort([service(["8317:8317"])], 3000)).toBe(8317);
  });

  it("distinguishes published host and container ports", () => {
    const svc = service(["127.0.0.1:8080:3000/tcp"]);
    expect(serviceContainerPort(svc)).toBe(3000);
    expect(serviceHostPort(svc)).toBe(8080);
  });

  it("prefers the explicit exposed port for the container and keeps the published host", () => {
    const svc = service(["8080:3000"], "3000");
    expect(serviceContainerPort(svc)).toBe(3000);
    expect(serviceHostPort(svc)).toBe(8080);
  });

  it("falls back to the project port for single-app projects", () => {
    expect(projectContainerPort([], 4173)).toBe(4173);
    expect(projectHostPort([], null)).toBe(3000);
  });
});
