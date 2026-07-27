import { describe, expect, it } from "vitest";
import type { DockerContainerDetail } from "./types";
import { buildTraefikLabels, resolveExistingTraefik } from "./traefik-edge";

function container(overrides: Partial<DockerContainerDetail> = {}): DockerContainerDetail {
  return {
    id: "traefik-id",
    name: "traefik",
    image: "traefik:v3.3",
    imageId: "sha256:1",
    state: "running",
    command: [
      "--providers.docker=true",
      "--providers.docker.network=proxy",
      "--entrypoints.websecure.address=:443",
    ],
    env: [],
    labels: {},
    networks: ["proxy"],
    mounts: [
      {
        type: "bind",
        source: "/var/run/docker.sock",
        destination: "/var/run/docker.sock",
        rw: false,
      },
    ],
    ports: [],
    ...overrides,
  };
}

describe("resolveExistingTraefik", () => {
  it("infers a Docker-provider network and HTTPS entrypoint without mutating Traefik", () => {
    expect(resolveExistingTraefik(container())).toMatchObject({
      network: "proxy",
      entrypoint: "websecure",
      tls: true,
      source: "existing",
    });
  });

  it("fails closed when Docker provider support cannot be verified", () => {
    expect(() =>
      resolveExistingTraefik(container({ command: ["--entrypoints.websecure.address=:443"] })),
    ).toThrow(/Docker provider/);
  });

  it("accepts explicit manual values for config-file based Traefik", () => {
    expect(
      resolveExistingTraefik(container({ command: [], networks: ["front", "metrics"] }), {
        network: "front",
        entrypoint: "https",
        tls: true,
        certResolver: "le",
      }),
    ).toMatchObject({ network: "front", entrypoint: "https", certResolver: "le" });
  });
});

describe("buildTraefikLabels", () => {
  it("builds stable per-route labels and selects the shared edge network", () => {
    expect(
      buildTraefikLabels({
        network: "vibrail-edge",
        entrypoint: "websecure",
        tls: true,
        routes: [{ routerName: "vibrail-oo198w", hostname: "demo-oo198w.example.com", port: 8000 }],
      }),
    ).toMatchObject({
      "traefik.enable": "true",
      "traefik.docker.network": "vibrail-edge",
      "traefik.http.routers.vibrail-oo198w.rule": "Host(`demo-oo198w.example.com`)",
      "traefik.http.routers.vibrail-oo198w.entrypoints": "websecure",
      "traefik.http.routers.vibrail-oo198w.tls": "true",
      "traefik.http.services.vibrail-oo198w.loadbalancer.server.port": "8000",
    });
  });
});
