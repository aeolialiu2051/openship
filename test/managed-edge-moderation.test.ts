/// <reference path="../apps/router-worker/src/cloudflare.d.ts" />
import { describe, expect, it, vi } from "vitest";
import { buildTraefikSuspensionLabels } from "../packages/adapters/src/runtime/traefik-edge";
import {
  MemoryNonceStore,
  deriveServerSecret,
  gatewayRequest,
} from "../apps/origin-auth-gateway/src/index";
import { routeRequest, type Env } from "../apps/router-worker/src/index";

describe("managed-edge project moderation", () => {
  it("keeps edge authority active and reaches the origin suspension redirect", async () => {
    const hostname = "offline-a1b2c3d4.vibrail.app";
    const projectId = "project-offline";
    const routeVersion = 7;
    const masterSecret = "moderation-chain-master-secret";
    const labels = buildTraefikSuspensionLabels(
      {
        network: "vibrail-edge",
        entrypoint: "websecure",
        tls: true,
        source: "vibrail",
        containerId: "traefik",
      },
      projectId,
      [{ hostname, redirectUrl: `https://vibrail.com/suspended?site=${hostname}` }],
    );
    const redirectLocation = String(
      Object.entries(labels).find(([key]) => key.endsWith(".redirectregex.replacement"))?.[1],
    );
    const gatewayConfig = {
      serverId: "001",
      currentServerSecret: deriveServerSecret(masterSecret, "001"),
      nonceStore: new MemoryNonceStore(),
      authority: {
        isCurrent: async (route: { projectId: string; routeVersion: number }) =>
          route.projectId === projectId && route.routeVersion === routeVersion,
      },
    };

    vi.stubGlobal("caches", {
      default: {
        match: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
      },
    });
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.hostname === "server-001.vibrail.app") {
        return gatewayRequest(new Request(url, init), gatewayConfig);
      }
      const headers = new Headers(init?.headers);
      expect(url.href).toBe("http://127.0.0.1:8080/");
      expect(headers.get("host")).toBe(hostname);
      return new Response(null, { status: 307, headers: { location: redirectLocation } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await routeRequest(
      new Request(`https://${hostname}/`),
      {
        ROUTING: {
          get: vi.fn(async () => ({
            project_id: projectId,
            service_id: null,
            server_id: "001",
            enabled: true,
            version: routeVersion,
            updated_at: new Date().toISOString(),
          })),
        },
        VIBRAIL_ROUTER_MASTER_SECRET: masterSecret,
      } as unknown as Env,
      { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `https://vibrail.com/suspended?site=${hostname}`,
    );
    expect(response.headers.get("x-vibrail-route-status")).toBe("hit");
    expect(response.headers.get("x-vibrail-route-version")).toBe(String(routeVersion));
  });
});
