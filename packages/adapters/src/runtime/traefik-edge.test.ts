import { describe, expect, it } from "vitest";
import type { DockerContainerDetail } from "./types";
import {
  VIBRAIL_EDGE_CERT_RESOLVER_LABEL,
  VIBRAIL_EDGE_COMPATIBLE_LABEL,
  VIBRAIL_EDGE_CONFIG_VERSION,
  VIBRAIL_EDGE_ENTRYPOINT_LABEL,
  VIBRAIL_EDGE_HTTP_ENTRYPOINT_LABEL,
  VIBRAIL_EDGE_IMAGE,
  VIBRAIL_EDGE_NETWORK_LABEL,
  VIBRAIL_EDGE_TLS_LABEL,
  buildTraefikLabels,
  buildTraefikSuspensionLabels,
  isTraefikContainer,
  parseTraefikStaticConfig,
  resolveExistingTraefik,
  traefikConfigFromLabels,
  traefikStaticConfigSources,
} from "./traefik-edge";

describe("managed Traefik compatibility", () => {
  it("uses a Docker-29-compatible image and migrates older managed edges", () => {
    expect(VIBRAIL_EDGE_IMAGE).toBe("traefik:v3.6");
    expect(Number(VIBRAIL_EDGE_CONFIG_VERSION)).toBeGreaterThanOrEqual(4);
  });

  it("does not mistake a suspension label carrier for the shared edge", () => {
    expect(
      isTraefikContainer(
        container({
          name: "openship-suspended-project-1",
          labels: { "openship.suspension-route": "true" },
          mounts: [],
        }),
      ),
    ).toBe(false);
  });
});

function container(overrides: Partial<DockerContainerDetail> = {}): DockerContainerDetail {
  return {
    id: "traefik-id",
    name: "traefik",
    image: "traefik:v3.6",
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
[entryPoints.web]
  address = ":80"
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
      httpEntrypoint: "web",
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
            [VIBRAIL_EDGE_HTTP_ENTRYPOINT_LABEL]: "web",
            [VIBRAIL_EDGE_TLS_LABEL]: "true",
            [VIBRAIL_EDGE_CERT_RESOLVER_LABEL]: "letsencrypt",
          },
        }),
      ),
    ).toEqual({
      dockerProvider: true,
      network: "proxy",
      entrypoint: "websecure",
      httpEntrypoint: "web",
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

  it("keeps TLS and externally terminated HTTP routes separate", () => {
    const labels = buildTraefikLabels({
      network: "proxy",
      entrypoint: "websecure",
      httpEntrypoint: "web",
      tls: true,
      certResolver: "letsencrypt",
      routes: [
        { routerName: "secure", hostname: "secure.example.com", port: 3000 },
        { routerName: "external", hostname: "external.example.com", port: 3000, tls: false },
      ],
    });

    expect(labels).toMatchObject({
      "traefik.http.routers.secure.entrypoints": "websecure",
      "traefik.http.routers.secure.tls": "true",
      "traefik.http.routers.secure.tls.certresolver": "letsencrypt",
      "traefik.http.routers.secure-redirect.entrypoints": "web",
      "traefik.http.routers.external.entrypoints": "web",
      "traefik.http.routers.external.tls": "false",
    });
    expect(labels["traefik.http.routers.external.tls.certresolver"]).toBeUndefined();
  });

  it("builds exact-host, non-permanent redirects for a suspended project", () => {
    const labels = buildTraefikSuspensionLabels(
      {
        network: "vibrail-edge",
        entrypoint: "websecure",
        httpEntrypoint: "web",
        tls: true,
        source: "vibrail",
        containerId: "edge",
      },
      "project-1",
      [
        {
          hostname: "app.example.com",
          redirectUrl: "https://ops.example.com/suspended?site=app.example.com",
        },
      ],
    );
    const router = Object.keys(labels).find(
      (key) => key.endsWith(".rule") && labels[key] === "Host(`app.example.com`)",
    )!;
    const name = router.split(".")[3]!;
    expect(labels).toMatchObject({
      "traefik.enable": "true",
      "traefik.docker.network": "vibrail-edge",
      "openship.project": "project-1",
      [`traefik.http.routers.${name}.service`]: "noop@internal",
      [`traefik.http.routers.${name}.entrypoints`]: "websecure",
      [`traefik.http.routers.${name}.priority`]: "100000",
      [`traefik.http.routers.${name}-http.entrypoints`]: "web",
      [`traefik.http.middlewares.${name}-redirect.redirectregex.replacement`]:
        "https://ops.example.com/suspended?site=app.example.com",
      [`traefik.http.middlewares.${name}-redirect.redirectregex.permanent`]: "false",
    });
  });

  it("prefixes static requests with the selected document-root path", () => {
    const labels = buildTraefikLabels({
      network: "proxy",
      entrypoint: "websecure",
      tls: true,
      routes: [
        {
          routerName: "docs",
          hostname: "docs.example.com",
          port: 3000,
          targetPath: "/docs",
        },
      ],
    });
    expect(labels).toMatchObject({
      "traefik.http.middlewares.docs-root.addprefix.prefix": "/docs",
      "traefik.http.routers.docs.middlewares": "docs-root@docker",
    });
  });

  it("builds native middleware labels and path-scoped routers", () => {
    const labels = buildTraefikLabels({
      network: "proxy",
      entrypoint: "websecure",
      tls: true,
      routes: [{ routerName: "vibrail-api", hostname: "api.example.com", port: 8000 }],
      routeRules: {
        "api.example.com": [
          {
            name: "vibrail-rr-global",
            rateLimit: { average: 10, burst: 20 },
            inFlightReq: { amount: 100 },
          },
          {
            name: "vibrail-rr-admin",
            pathPrefix: "/admin",
            ipAllowList: { sourceRange: ["203.0.113.10", "10.0.0.0/8"] },
          },
        ],
      },
    });

    expect(labels).toMatchObject({
      "traefik.http.middlewares.vibrail-rr-global-rate.ratelimit.average": "10",
      "traefik.http.middlewares.vibrail-rr-global-rate.ratelimit.period": "1s",
      "traefik.http.middlewares.vibrail-rr-global-rate.ratelimit.burst": "20",
      "traefik.http.middlewares.vibrail-rr-global-flight.inflightreq.amount": "100",
      "traefik.http.routers.vibrail-api.middlewares":
        "vibrail-rr-global-rate@docker,vibrail-rr-global-flight@docker",
      "traefik.http.middlewares.vibrail-rr-admin-ip.ipallowlist.sourcerange":
        "203.0.113.10,10.0.0.0/8",
      "traefik.http.routers.vibrail-api-rule-0.rule":
        "Host(`api.example.com`) && PathPrefix(`/admin`)",
      "traefik.http.routers.vibrail-api-rule-0.service": "vibrail-api",
      "traefik.http.routers.vibrail-api-rule-0.middlewares":
        "vibrail-rr-global-rate@docker,vibrail-rr-global-flight@docker,vibrail-rr-admin-ip@docker",
      "traefik.http.routers.vibrail-api-rule-0.priority": "10006",
    });
  });
});
