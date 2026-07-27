import type { TraefikEdgeConfig } from "../types";
import type { DockerContainerDetail, ResolvedTraefikEdge, TraefikManualConfig } from "./types";

export const VIBRAIL_EDGE_CONTAINER = "vibrail-edge";
export const VIBRAIL_EDGE_NETWORK = "vibrail-edge";
export const VIBRAIL_EDGE_ENTRYPOINT = "websecure";
export const VIBRAIL_EDGE_CERT_RESOLVER = "vibrail-letsencrypt";
export const VIBRAIL_EDGE_IMAGE = "traefik:v3.3";
export const VIBRAIL_EDGE_MANAGED_LABEL = "vibrail.edge.managed";
export const VIBRAIL_EDGE_COMPATIBLE_LABEL = "vibrail.edge.compatible";
export const VIBRAIL_EDGE_NETWORK_LABEL = "vibrail.edge.network";
export const VIBRAIL_EDGE_ENTRYPOINT_LABEL = "vibrail.edge.entrypoint";
export const VIBRAIL_EDGE_TLS_LABEL = "vibrail.edge.tls";
export const VIBRAIL_EDGE_CERT_RESOLVER_LABEL = "vibrail.edge.certresolver";

const SAFE_NAME = /^[a-zA-Z0-9_.-]+$/;

export interface DetectedTraefikConfig extends TraefikManualConfig {
  dockerProvider?: boolean;
}

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

function scalarValue(value: string): string {
  const trimmed = value
    .trim()
    .replace(/\s+#.*$/, "")
    .trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isHttpsAddress(value: string | undefined): boolean {
  return !!value && /(^|:|\])443(?:\/tcp)?$/i.test(scalarValue(value));
}

interface ConfigEntry {
  path: string[];
  value?: string;
}

function parseYamlEntries(text: string): ConfigEntry[] {
  const entries: ConfigEntry[] = [];
  const stack: Array<{ indent: number; key: string }> = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#") || rawLine.includes("\t")) continue;
    const match = /^(\s*)([a-zA-Z0-9_.-]+)\s*:\s*(.*?)\s*$/.exec(rawLine);
    if (!match) continue;
    const indent = match[1]!.length;
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) stack.pop();
    const key = match[2]!.toLowerCase();
    const value = match[3] ? scalarValue(match[3]) : undefined;
    entries.push({ path: [...stack.map((part) => part.key), key], ...(value ? { value } : {}) });
    if (!value) stack.push({ indent, key });
  }
  return entries;
}

function parseTomlEntries(text: string): ConfigEntry[] {
  const entries: ConfigEntry[] = [];
  let section: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1]!.split(".").map((part) => scalarValue(part).toLowerCase());
      entries.push({ path: section });
      continue;
    }
    const valueMatch = /^([a-zA-Z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
    if (!valueMatch) continue;
    entries.push({
      path: [...section, valueMatch[1]!.toLowerCase()],
      value: scalarValue(valueMatch[2]!),
    });
  }
  return entries;
}

function samePath(entry: ConfigEntry, ...parts: string[]): boolean {
  return entry.path.length === parts.length && entry.path.every((part, i) => part === parts[i]);
}

/** Extract only the small static-config surface Vibrail needs. This supports
 * Traefik's YAML and TOML forms without treating the file as executable input. */
export function parseTraefikStaticConfig(text: string): DetectedTraefikConfig {
  const entries = [...parseYamlEntries(text), ...parseTomlEntries(text)];
  const providerEntry = entries.find(
    (entry) =>
      entry.path.length >= 2 && entry.path[0] === "providers" && entry.path[1] === "docker",
  );
  const providerValue = providerEntry?.value ? boolValue(providerEntry.value) : undefined;
  const dockerProvider = providerEntry ? (providerValue ?? true) : undefined;
  const network = entries.find((entry) => samePath(entry, "providers", "docker", "network"))?.value;

  const httpsEntrypoints = new Set<string>();
  for (const entry of entries) {
    if (
      entry.path.length === 3 &&
      entry.path[0] === "entrypoints" &&
      entry.path[2] === "address" &&
      isHttpsAddress(entry.value)
    ) {
      httpsEntrypoints.add(entry.path[1]!);
    }
  }
  const entrypoint = httpsEntrypoints.size === 1 ? [...httpsEntrypoints][0] : undefined;

  const resolvers = new Set<string>();
  for (const entry of entries) {
    if (entry.path.length >= 2 && entry.path[0] === "certificatesresolvers") {
      resolvers.add(entry.path[1]!);
    }
  }
  const entrypointResolver = entrypoint
    ? entries.find((entry) =>
        samePath(entry, "entrypoints", entrypoint, "http", "tls", "certresolver"),
      )?.value
    : undefined;
  const certResolver = entrypointResolver || (resolvers.size === 1 ? [...resolvers][0] : undefined);

  const tlsEntry = entrypoint
    ? entries.find((entry) => samePath(entry, "entrypoints", entrypoint, "http", "tls"))
    : undefined;
  const tls = tlsEntry?.value ? boolValue(tlsEntry.value) : certResolver ? true : undefined;

  return {
    ...(dockerProvider !== undefined ? { dockerProvider } : {}),
    ...(network ? { network } : {}),
    ...(entrypoint ? { entrypoint } : {}),
    ...(tls !== undefined ? { tls } : {}),
    ...(certResolver ? { certResolver } : {}),
  };
}

export function traefikConfigFromLabels(container: DockerContainerDetail): DetectedTraefikConfig {
  if (container.labels[VIBRAIL_EDGE_COMPATIBLE_LABEL] !== "true") return {};
  const tls = boolValue(container.labels[VIBRAIL_EDGE_TLS_LABEL]);
  return {
    dockerProvider: true,
    ...(container.labels[VIBRAIL_EDGE_NETWORK_LABEL]
      ? { network: container.labels[VIBRAIL_EDGE_NETWORK_LABEL] }
      : {}),
    ...(container.labels[VIBRAIL_EDGE_ENTRYPOINT_LABEL]
      ? { entrypoint: container.labels[VIBRAIL_EDGE_ENTRYPOINT_LABEL] }
      : {}),
    ...(tls !== undefined ? { tls } : {}),
    ...(container.labels[VIBRAIL_EDGE_CERT_RESOLVER_LABEL]
      ? { certResolver: container.labels[VIBRAIL_EDGE_CERT_RESOLVER_LABEL] }
      : {}),
  };
}

/** Resolve host-side files mounted at Traefik's static configuration paths.
 * Only mounts already exposed by docker inspect are considered. */
export function traefikStaticConfigSources(container: DockerContainerDetail): string[] {
  const command = [...(container.entrypoint ?? []), ...(container.command ?? [])];
  const env = envMap(container.env);
  const configured =
    commandValue(command, "--configfile")?.trim() || env.get("TRAEFIK_CONFIGFILE")?.trim();
  const candidates = new Set(
    [
      configured,
      "/etc/traefik/traefik.yml",
      "/etc/traefik/traefik.yaml",
      "/etc/traefik/traefik.toml",
      "/traefik.yml",
      "/traefik.yaml",
      "/traefik.toml",
    ].filter((value): value is string => !!value?.startsWith("/")),
  );
  const sources = new Set<string>();
  for (const mount of container.mounts) {
    if (!mount.source || !mount.destination.startsWith("/")) continue;
    const destination = mount.destination.replace(/\/+$/, "") || "/";
    for (const candidate of candidates) {
      if (candidate === destination) {
        sources.add(mount.source);
        continue;
      }
      if (destination !== "/" && candidate.startsWith(`${destination}/`)) {
        const relative = candidate.slice(destination.length + 1);
        if (relative && !relative.split("/").includes("..")) {
          sources.add(`${mount.source.replace(/\/+$/, "")}/${relative}`);
        }
      }
    }
  }
  return [...sources];
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
 * Static-file detection is accepted when it is unambiguous; all remaining
 * ambiguity fails closed instead of guessing or mutating Traefik. */
export function resolveExistingTraefik(
  container: DockerContainerDetail,
  manual: TraefikManualConfig = {},
  detected: DetectedTraefikConfig = {},
): ResolvedTraefikEdge {
  const command = [...(container.entrypoint ?? []), ...(container.command ?? [])];
  const env = envMap(container.env);
  const providerFlag =
    boolValue(commandValue(command, "--providers.docker")) ??
    boolValue(env.get("TRAEFIK_PROVIDERS_DOCKER")) ??
    detected.dockerProvider;
  const hasDockerSocket = container.mounts.some(
    (mount) => mount.destination === "/var/run/docker.sock",
  );

  if (providerFlag === false) {
    throw new Error(
      `Existing Traefik container "${container.name}" explicitly disables the Docker provider. ` +
        "Vibrail did not modify it.",
    );
  }
  const selectedNetwork = manual.network || detected.network;
  const selectedEntrypoint = manual.entrypoint || detected.entrypoint;
  if (providerFlag !== true && !(hasDockerSocket && selectedNetwork && selectedEntrypoint)) {
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
    detected.network ||
    (userNetworks.length === 1 ? userNetworks[0] : undefined);
  if (!network || !SAFE_NAME.test(network) || !container.networks.includes(network)) {
    throw new Error(
      `Could not safely identify a Docker network shared with Traefik "${container.name}". ` +
        "Set traefikNetwork on this Vibrail server to a network already attached to that Traefik container.",
    );
  }

  const entrypoint =
    manual.entrypoint || entrypointFromAddress(command, env) || detected.entrypoint;
  if (!entrypoint || !SAFE_NAME.test(entrypoint)) {
    throw new Error(
      `Could not safely identify the HTTPS entrypoint for Traefik "${container.name}". ` +
        "Set traefikEntrypoint (for example, websecure) on this Vibrail server.",
    );
  }

  const certResolver =
    manual.certResolver || explicitCertResolver(command, env, entrypoint) || detected.certResolver;
  if (certResolver && !SAFE_NAME.test(certResolver)) {
    throw new Error("The configured Traefik certificate resolver name is invalid.");
  }

  return {
    network,
    entrypoint,
    tls: manual.tls ?? detected.tls ?? true,
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
