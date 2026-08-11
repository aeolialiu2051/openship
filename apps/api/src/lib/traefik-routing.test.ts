import { describe, expect, it, vi } from "vitest";
vi.mock("./server-origin-infra", () => ({ provisionServerOrigin: vi.fn() }));
import { compileServerTraefikRateLimit } from "./traefik-routing";
import { vibrailRouterName } from "./traefik-router-name";

describe("vibrailRouterName", () => {
  it("keeps different hostnames unique when service and port match", () => {
    expect(vibrailRouterName("project", "service", "3000", "a.example.com")).not.toBe(
      vibrailRouterName("project", "service", "3000", "b.example.com"),
    );
  });

  it("keeps long names bounded without discarding the distinguishing suffix", () => {
    const first = vibrailRouterName("project", "x".repeat(80), "a.example.com");
    const second = vibrailRouterName("project", "x".repeat(80), "b.example.com");
    expect(first.length).toBeLessThanOrEqual(63);
    expect(second.length).toBeLessThanOrEqual(63);
    expect(first).not.toBe(second);
  });
});

describe("compileServerTraefikRateLimit", () => {
  const routes = [
    { routerName: "web", hostname: "Example.com", port: 3000 },
    { routerName: "api", hostname: "example.com", port: 4000 },
    { routerName: "docs", hostname: "docs.example.com", port: 5000 },
  ];

  it("adds one host-wide native Traefik middleware per hostname", () => {
    expect(compileServerTraefikRateLimit("server-1", "project-1", 50.9, 20.8, routes)).toEqual({
      "example.com": [
        {
          name: "vibrail-server-server-1-project-1-rate",
          rateLimit: { average: 50, burst: 20 },
        },
      ],
      "docs.example.com": [
        {
          name: "vibrail-server-server-1-project-1-rate",
          rateLimit: { average: 50, burst: 20 },
        },
      ],
    });
  });

  it("omits the middleware when the server policy is disabled", () => {
    expect(compileServerTraefikRateLimit("server-1", "project-1", 0, 0, routes)).toEqual({});
  });
});
