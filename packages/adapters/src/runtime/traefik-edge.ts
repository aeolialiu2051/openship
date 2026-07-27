import type { TraefikEdgeConfig } from "../types";
import type { DockerContainerDetail, ResolvedTraefikEdge, TraefikManualConfig } from "./types";

export const VIBRAIL_EDGE_CONTAINER = "vibrail-edge";
export const VIBRAIL_EDGE_NETWORK = "vibrail-edge";
export const VIBRAIL_EDGE_ENTRYPOINT = "websecure";
export const VIBRAIL_EDGE_CERT_RESOLVER = "vibrail-letsencrypt";
export const VIBRAIL_EDGE_IMAGE = "traefik:v3.3";
export const VIBRAIL_EDGE_MANAGED_LABEL = "vibrail.edge.managed";

const SAFE_NAME = /^[a-zA-Z0-9_.-]+$/;

function envMap(values: string[]): Map<string, string> {
  return new Map(
    values.map((value) => {
      const index = value.indexOf("=");
      return index < 0 ? [value, ""] : [value.slice(0, index), value.slice(index + 1)];
    }),
  );
}

function commandValue(command: string[], key: string): string | undefined {
  const normalized = key.toLowerCase();
  for (let index = 0; index < command.length; index += 1) {
    const part = command[index]!;
    const lower = part.toLowerCase();
    if (lower === normalized) {
      const next = command[index + 1];
      return !next || next.startsWith("--") ? "true" : next;
    }
    if (lower.startsWith(`${normalized}=`)) return part.slice(part.indexOf("=") + 1);
  }
  return undefined;
}

function boolValue(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on", ""].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function entrypointFromAddress(command: string[], env: Map<string, string>): string | undefined {
  const candidates = new Set<string>();
  for (const part of command) {
    const match = /^--entrypoints\.([a-zA-Z0-9_.-]+)\.address=(.+)$/i.exec(part);
    if (match && /(^|:|\])443(?:\/tcp)?$/i.test(match[2]!)) candidates.add(match[1]!);
  }
  for (const [key, value] of env) {
    const match = /^TRAEFIK_ENTRYPOINTS_([A-Z0-9_]+)_ADDRESS$/i.exec(key);
    if (match && /(^|:|\])443(?:\/tcp)?$/i.test(value)) {
      candidates.add(match[1]!.toLowerCase().replaceAll("_", "-"));
    }
  }
  return candidates.size === 1 ? [...candidates][0] : undefined;
}

function explicitDockerNetwork(command: string[], env: Map<string, string>): string | undefined {
  return (
    (
      commandValue(command, "--providers.docker.network") ??
      env.get("TRAEFIK_PROVIDERS_DOCKER_NETWORK")
    )?.trim() || undefined
  );
}

function explicitCertResolver(
  command: string[],
  env: Map<string, string>,
  entrypoint: string,
): string | undefined {
  const commandKey = `--entrypoints.${entrypoint}.http.tls.certresolver`;
  const envKey = `TRAEFIK_ENTRYPOINTS_${entrypoint.toUpperCase().replaceAll("-", "_")}_HTTP_TLS_CERTRESOLVER`;
  return commandValue(command, commandKey)?.trim() || env.get(envKey)?.trim() || undefined;
}

export function isTraefikContainer(container: DockerContainerDetail): boolean {
  return (
    container.name === VIBRAIL_EDGE_CONTAINER ||
    container.labels[VIBRAIL_EDGE_MANAGED_LABEL] === "true" ||
    /(^|\/|:)traefik(?::|@|$)/i.test(container.image) ||
    (/traefik/i.test(container.name) &&
      container.mounts.some((mount) => mount.destination === "/var/run/docker.sock"))
  );
}

/** Safely infer the minimum Docker-provider settings needed for label routing.
 * Ambiguous config-file based installations intentionally fail closed and ask
 * the operator for explicit values instead of guessing or mutating Traefik. */
export function resolveExistingTraefik(
  container: DockerContainerDetail,
  manual: TraefikManualConfig = {},
): ResolvedTraefikEdge {
  const command = [...(container.entrypoint ?? []), ...(container.command ?? [])];
  const env = envMap(container.env);
  const providerFlag =
    boolValue(commandValue(command, "--providers.docker")) ??
    boolValue(env.get("TRAEFIK_PROVIDERS_DOCKER"));
  const hasDockerSocket = container.mounts.some(
    (mount) => mount.destination === "/var/run/docker.sock",
  );

  if (providerFlag === false) {
    throw new Error(
      `Existing Traefik container "${container.name}" explicitly disables the Docker provider. ` +
        "Vibrail did not modify it.",
    );
  }
  if (providerFlag !== true && !(hasDockerSocket && manual.network && manual.entrypoint)) {
    throw new Error(
      `Existing Traefik container "${container.name}" could not be safely verified as using the Docker provider. ` +
        "Configure the server's Traefik network, HTTPS entrypoint and TLS settings manually; Vibrail will not modify or restart the existing proxy.",
    );
  }

  const configuredNetwork = explicitDockerNetwork(command, env);
  const userNetworks = container.networks.filter(
    (network) => !["bridge", "host", "none"].includes(network),
  );
  const network =
    manual.network ||
    configuredNetwork ||
    (userNetworks.length === 1 ? userNetworks[0] : undefined);
  if (!network || !SAFE_NAME.test(network) || !container.networks.includes(network)) {
    throw new Error(
      `Could not safely identify a Docker network shared with Traefik "${container.name}". ` +
        "Set traefikNetwork on this Vibrail server to a network already attached to that Traefik container.",
    );
  }

  const entrypoint = manual.entrypoint || entrypointFromAddress(command, env);
  if (!entrypoint || !SAFE_NAME.test(entrypoint)) {
    throw new Error(
      `Could not safely identify the HTTPS entrypoint for Traefik "${container.name}". ` +
        "Set traefikEntrypoint (for example, websecure) on this Vibrail server.",
    );
  }

  const certResolver = manual.certResolver || explicitCertResolver(command, env, entrypoint);
  if (certResolver && !SAFE_NAME.test(certResolver)) {
    throw new Error("The configured Traefik certificate resolver name is invalid.");
  }

  return {
    network,
    entrypoint,
    tls: manual.tls ?? true,
    ...(certResolver ? { certResolver } : {}),
    source: container.labels[VIBRAIL_EDGE_MANAGED_LABEL] === "true" ? "vibrail" : "existing",
    containerId: container.id,
  };
}

function safeLabelValue(value: string): string {
  return value.replace(/[\r\n]/g, "");
}

export function buildTraefikLabels(config: TraefikEdgeConfig): Record<string, string> {
  const labels: Record<string, string> = {
    "traefik.enable": "true",
    "traefik.docker.network": config.network,
  };
  for (const route of config.routes) {
    if (!SAFE_NAME.test(route.routerName)) {
      throw new Error(`Invalid Traefik router name: ${route.routerName}`);
    }
    if (!Number.isInteger(route.port) || route.port <= 0 || route.port > 65_535) {
      throw new Error(`Invalid Traefik target port: ${route.port}`);
    }
    const router = `traefik.http.routers.${route.routerName}`;
    const service = `traefik.http.services.${route.routerName}`;
    labels[`${router}.rule`] = `Host(\`${safeLabelValue(route.hostname)}\`)`;
    labels[`${router}.entrypoints`] = config.entrypoint;
    labels[`${router}.tls`] = String(config.tls);
    labels[`${router}.service`] = route.routerName;
    if (config.certResolver) labels[`${router}.tls.certresolver`] = config.certResolver;
    labels[`${service}.loadbalancer.server.port`] = String(route.port);
  }
  return labels;
}
