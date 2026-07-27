import { describe, expect, it } from "vitest";
import type { DockerContainerDetail } from "./types";
import {
  VIBRAIL_EDGE_CERT_RESOLVER_LABEL,
  VIBRAIL_EDGE_COMPATIBLE_LABEL,
  VIBRAIL_EDGE_ENTRYPOINT_LABEL,
  VIBRAIL_EDGE_NETWORK_LABEL,
  VIBRAIL_EDGE_TLS_LABEL,
  buildTraefikLabels,
  parseTraefikStaticConfig,
  resolveExistingTraefik,
  traefikConfigFromLabels,
  traefikStaticConfigSources,
} from "./traefik-edge";

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

  it("accepts settings detected from a mounted static config", () => {
    const detected = parseTraefikStaticConfig(`
entryPoints:
  websecure:
    address: ':443'
providers:
  docker:
    exposedByDefault: false
    network: traefik-service
certificatesResolvers:
  letsencrypt:
    acme:
      storage: /letsencrypt/acme.json
`);
    expect(
      resolveExistingTraefik(
        container({ command: [], networks: ["traefik-service"] }),
        {},
        detected,
      ),
    ).toMatchObject({
      network: "traefik-service",
      entrypoint: "websecure",
      tls: true,
      certResolver: "letsencrypt",
    });
  });
});

describe("Traefik static config detection", () => {
  it("parses TOML Docker-provider, HTTPS entrypoint and resolver settings", () => {
    expect(
      parseTraefikStaticConfig(`
[entryPoints.https]
  address = ":443"
[entryPoints.https.http.tls]
  certResolver = "le"
[providers.docker]
  network = "proxy"
[certificatesResolvers.le.acme]
  storage = "/data/acme.json"
`),
    ).toMatchObject({
      dockerProvider: true,
      network: "proxy",
      entrypoint: "https",
      tls: true,
      certResolver: "le",
    });
  });

  it("maps the default in-container config path to its inspected bind source", () => {
    expect(
      traefikStaticConfigSources(
        container({
          command: [],
          mounts: [
            {
              type: "bind",
              source: "/opt/traefik-service/traefik.yml",
              destination: "/etc/traefik/traefik.yml",
              rw: false,
            },
          ],
        }),
      ),
    ).toContain("/opt/traefik-service/traefik.yml");
  });

  it("reads explicit compatibility metadata without inspecting a file", () => {
    expect(
      traefikConfigFromLabels(
        container({
          labels: {
            [VIBRAIL_EDGE_COMPATIBLE_LABEL]: "true",
            [VIBRAIL_EDGE_NETWORK_LABEL]: "proxy",
            [VIBRAIL_EDGE_ENTRYPOINT_LABEL]: "websecure",
            [VIBRAIL_EDGE_TLS_LABEL]: "true",
            [VIBRAIL_EDGE_CERT_RESOLVER_LABEL]: "letsencrypt",
          },
        }),
      ),
    ).toEqual({
      dockerProvider: true,
      network: "proxy",
      entrypoint: "websecure",
      tls: true,
      certResolver: "letsencrypt",
    });
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
