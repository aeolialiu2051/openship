import type { TraefikEdgeConfig, TraefikRouteRuleConfig } from "../types";
import type { DockerContainerDetail, ResolvedTraefikEdge, TraefikManualConfig } from "./types";

export const VIBRAIL_EDGE_CONTAINER = "vibrail-edge";
export const VIBRAIL_EDGE_NETWORK = "vibrail-edge";
export const VIBRAIL_EDGE_ENTRYPOINT = "websecure";
export const VIBRAIL_EDGE_HTTP_ENTRYPOINT = "web";
export const VIBRAIL_EDGE_CLOUDFLARE_ENTRYPOINT = "cloudflare-origin";
export const VIBRAIL_EDGE_CERT_RESOLVER = "vibrail-letsencrypt";
export const VIBRAIL_EDGE_DYNAMIC_HOST_DIR = "/var/lib/vibrail/traefik/dynamic";
export const VIBRAIL_EDGE_DYNAMIC_CONTAINER_DIR = "/etc/traefik/dynamic";
// Traefik 3.3 uses Docker API v1.24 even when DOCKER_API_VERSION is set. Docker
// 29 rejects that client, leaving the Docker provider offline and every managed
// domain on Traefik's default 404/self-signed certificate. Traefik 3.6 uses a
// compatible Docker client and has been verified against Docker 29.
export const VIBRAIL_EDGE_IMAGE =
  process.env.VIBRAIL_EDGE_IMAGE ??
  `${process.env.VIBRAIL_IMAGE_REGISTRY ?? "ghcr.io/aeolialiu2051"}/vibrail-edge:${process.env.VIBRAIL_VERSION ?? "latest"}`;
export const VIBRAIL_EDGE_MANAGED_LABEL = "vibrail.edge.managed";
export const VIBRAIL_EDGE_CONFIG_VERSION_LABEL = "vibrail.edge.config-version";
// Version 8 recreates edges built with the v7 image whose local plugin used a
// Go package identifier Traefik could not resolve at runtime.
export const VIBRAIL_EDGE_CONFIG_VERSION = "10";
export const VIBRAIL_EDGE_COMPATIBLE_LABEL = "vibrail.edge.compatible";
export const VIBRAIL_EDGE_NETWORK_LABEL = "vibrail.edge.network";
export const VIBRAIL_EDGE_ENTRYPOINT_LABEL = "vibrail.edge.entrypoint";
export const VIBRAIL_EDGE_HTTP_ENTRYPOINT_LABEL = "vibrail.edge.http-entrypoint";
export const VIBRAIL_EDGE_TLS_LABEL = "vibrail.edge.tls";
export const VIBRAIL_EDGE_CERT_RESOLVER_LABEL = "vibrail.edge.certresolver";

const SAFE_NAME = /^[a-zA-Z0-9_.-]+$/;

export interface DetectedTraefikConfig extends TraefikManualConfig {
  dockerProvider?: boolean;
  httpEntrypoint?: string;
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
  const httpEntrypoints = new Set<string>();
  for (const entry of entries) {
    if (
      entry.path.length === 3 &&
      entry.path[0] === "entrypoints" &&
      entry.path[2] === "address" &&
      isHttpsAddress(entry.value)
    ) {
      httpsEntrypoints.add(entry.path[1]!);
    }
    if (
      entry.path.length === 3 &&
      entry.path[0] === "entrypoints" &&
      entry.path[2] === "address" &&
      /(^|:|\])80(?:\/tcp)?$/i.test(scalarValue(entry.value ?? ""))
    ) {
      httpEntrypoints.add(entry.path[1]!);
    }
  }
  const entrypoint = httpsEntrypoints.size === 1 ? [...httpsEntrypoints][0] : undefined;
  const httpEntrypoint = httpEntrypoints.size === 1 ? [...httpEntrypoints][0] : undefined;

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
    ...(httpEntrypoint ? { httpEntrypoint } : {}),
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
    ...(container.labels[VIBRAIL_EDGE_HTTP_ENTRYPOINT_LABEL]
      ? { httpEntrypoint: container.labels[VIBRAIL_EDGE_HTTP_ENTRYPOINT_LABEL] }
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

function httpEntrypointFromAddress(
  command: string[],
  env: Map<string, string>,
): string | undefined {
  const candidates = new Set<string>();
  for (const part of command) {
    const match = /^--entrypoints\.([a-zA-Z0-9_.-]+)\.address=(.+)$/i.exec(part);
    if (match && /(^|:|\])80(?:\/tcp)?$/i.test(match[2]!)) candidates.add(match[1]!);
  }
  for (const [key, value] of env) {
    const match = /^TRAEFIK_ENTRYPOINTS_([A-Z0-9_]+)_ADDRESS$/i.exec(key);
    if (match && /(^|:|\])80(?:\/tcp)?$/i.test(value)) {
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
  // Suspension-route carriers reuse the small Traefik image only as a durable
  // label host; they do not own the Docker socket or serve edge traffic and
  // must not be considered candidate reverse proxies during edge discovery.
  if (container.labels["vibrail.suspension-route"] === "true") return false;
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
  const managedHostNetwork =
    container.labels[VIBRAIL_EDGE_MANAGED_LABEL] === "true" && container.networks.includes("host");
  if (
    !network ||
    !SAFE_NAME.test(network) ||
    (!container.networks.includes(network) && !managedHostNetwork)
  ) {
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

  const httpEntrypoint = httpEntrypointFromAddress(command, env) || detected.httpEntrypoint;
  // A newly-created managed edge returns this field directly, but every later
  // runtime instance reaches this inspection path. Preserve the protected
  // entrypoint only when both managed/compatible labels and its static address
  // are present; never infer it for an arbitrary user-owned Traefik.
  const managedCloudflareEntrypoint =
    container.labels[VIBRAIL_EDGE_MANAGED_LABEL] === "true" &&
    container.labels[VIBRAIL_EDGE_COMPATIBLE_LABEL] === "true" &&
    (commandValue(
      command,
      `--entrypoints.${VIBRAIL_EDGE_CLOUDFLARE_ENTRYPOINT}.address`,
    )?.trim() ||
      env
        .get(
          `TRAEFIK_ENTRYPOINTS_${VIBRAIL_EDGE_CLOUDFLARE_ENTRYPOINT.toUpperCase().replaceAll("-", "_")}_ADDRESS`,
        )
        ?.trim())
      ? VIBRAIL_EDGE_CLOUDFLARE_ENTRYPOINT
      : undefined;
  return {
    network,
    entrypoint,
    ...(httpEntrypoint ? { httpEntrypoint } : {}),
    ...(managedCloudflareEntrypoint
      ? { cloudflareEntrypoint: managedCloudflareEntrypoint }
      : {}),
    tls: manual.tls ?? detected.tls ?? true,
    ...(certResolver ? { certResolver } : {}),
    source: container.labels[VIBRAIL_EDGE_MANAGED_LABEL] === "true" ? "vibrail" : "existing",
    containerId: container.id,
  };
}

/** Stable per-project file consumed by the managed edge's file provider. */
export function bareTraefikDynamicConfigPath(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 80);
  return `${VIBRAIL_EDGE_DYNAMIC_HOST_DIR}/bare-${safe}.json`;
}

function safeLabelValue(value: string): string {
  return value.replace(/[\r\n]/g, "");
}

function stableRouteSuffix(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** Labels for a route-only carrier container used after a project's workload
 * has been stopped. The router is still owned by the same Traefik Docker
 * provider, but redirects through noop@internal so no application backend is
 * needed. One exact Host router is emitted per suspended domain; unrelated
 * domains continue to hit Traefik's normal 404. */
export function buildTraefikSuspensionLabels(
  edge: ResolvedTraefikEdge,
  projectId: string,
  routes: Array<{ hostname: string; redirectUrl: string; managedOriginHost?: string }>,
): Record<string, string> {
  const labels: Record<string, string> = {
    "traefik.enable": "true",
    "traefik.docker.network": edge.network,
    "vibrail.project": projectId,
    "vibrail.suspension-route": "true",
  };

  for (const route of routes) {
    const suffix = stableRouteSuffix(`${projectId}:${route.hostname.toLowerCase()}`);
    const name = `vibrail-suspended-${suffix}`;
    const middleware = `${name}-redirect`;
    const router = `traefik.http.routers.${name}`;
    const managedOrigin = !!route.managedOriginHost;
    labels[`${router}.rule`] = managedOrigin
      ? `Host(\`${safeLabelValue(route.managedOriginHost!)}\`) && Header(\`x-vibrail-hostname\`, \`${safeLabelValue(route.hostname)}\`)`
      : `Host(\`${safeLabelValue(route.hostname)}\`)`;
    labels[`${router}.entrypoints`] = managedOrigin
      // Existing managed origins can still arrive on the edge's primary TLS
      // entrypoint (the Router Worker currently connects to port 443). Newer
      // edges may additionally expose the dedicated Cloudflare entrypoint.
      // Bind both while keeping the origin-auth middleware fail-closed, so a
      // suspension route works before and after an edge/AOP migration.
      ? [edge.entrypoint, edge.cloudflareEntrypoint].filter(Boolean).join(",")
      : edge.entrypoint;
    // Win even if a runtime stop partially failed and an old exact-Host router
    // is still advertised. Normal app routers rely on rule-length priority and
    // remain far below this explicit moderation override.
    labels[`${router}.priority`] = "100000";
    labels[`${router}.tls`] = "true";
    labels[`${router}.service`] = "noop@internal";
    const originAuthMiddleware = managedOrigin
      ? addOriginAuthLabels(labels, name, route.hostname)
      : null;
    labels[`${router}.middlewares`] = [originAuthMiddleware, middleware]
      .filter((value): value is string => !!value)
      .map((value) => `${value}@docker`)
      .join(",");
    labels[`traefik.http.middlewares.${middleware}.redirectregex.regex`] = "^https?://.*";
    labels[`traefik.http.middlewares.${middleware}.redirectregex.replacement`] = safeLabelValue(
      route.redirectUrl,
    );
    // A suspension can be lifted; never let browsers cache this redirect.
    labels[`traefik.http.middlewares.${middleware}.redirectregex.permanent`] = "false";

    if (edge.httpEntrypoint && !managedOrigin) {
      const httpName = `${name}-http`;
      const httpRouter = `traefik.http.routers.${httpName}`;
      labels[`${httpRouter}.rule`] = `Host(\`${safeLabelValue(route.hostname)}\`)`;
      labels[`${httpRouter}.entrypoints`] = edge.httpEntrypoint;
      labels[`${httpRouter}.priority`] = "100000";
      labels[`${httpRouter}.tls`] = "false";
      labels[`${httpRouter}.service`] = "noop@internal";
      labels[`${httpRouter}.middlewares`] = `${middleware}@docker`;
    }
  }
  return labels;
}

function middlewareNames(rule: TraefikRouteRuleConfig): string[] {
  return [
    rule.rateLimit ? `${rule.name}-rate` : null,
    rule.ipAllowList ? `${rule.name}-ip` : null,
    rule.inFlightReq ? `${rule.name}-flight` : null,
  ].filter((name): name is string => !!name);
}

function addMiddlewareLabels(labels: Record<string, string>, rule: TraefikRouteRuleConfig): void {
  if (!SAFE_NAME.test(rule.name)) throw new Error(`Invalid Traefik rule name: ${rule.name}`);
  if (rule.rateLimit) {
    const middleware = `traefik.http.middlewares.${rule.name}-rate.ratelimit`;
    labels[`${middleware}.average`] = String(rule.rateLimit.average);
    labels[`${middleware}.period`] = "1s";
    labels[`${middleware}.burst`] = String(rule.rateLimit.burst);
  }
  if (rule.ipAllowList) {
    labels[`traefik.http.middlewares.${rule.name}-ip.ipallowlist.sourcerange`] =
      rule.ipAllowList.sourceRange.map(safeLabelValue).join(",");
  }
  if (rule.inFlightReq) {
    labels[`traefik.http.middlewares.${rule.name}-flight.inflightreq.amount`] = String(
      rule.inFlightReq.amount,
    );
  }
}

function originAuthMiddlewareName(routerName: string): string {
  return `${routerName}-origin-auth`;
}

function addOriginAuthLabels(
  labels: Record<string, string>,
  routerName: string,
  hostname: string,
): string {
  const name = originAuthMiddlewareName(routerName);
  const plugin = `traefik.http.middlewares.${name}.plugin.vibrail-origin-auth`;
  labels[`${plugin}.secretFile`] = "/etc/vibrail/edge/server-secret";
  labels[`${plugin}.previousSecretFile`] = "/etc/vibrail/edge/previous-server-secret";
  labels[`${plugin}.manifestDirectory`] = "/etc/vibrail/edge-routes";
  labels[`${plugin}.timestampSkewSeconds`] = "60";
  labels[`${plugin}.hostname`] = safeLabelValue(hostname);
  return name;
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
    const tls = route.tls ?? config.tls;
    const entrypoint = tls ? config.entrypoint : config.httpEntrypoint;
    if (!entrypoint) {
      throw new Error(
        `Traefik route ${route.hostname} requires a plain-HTTP entrypoint, but none was detected.`,
      );
    }
    if (!route.managedOrigin) {
      labels[`${router}.rule`] = `Host(\`${safeLabelValue(route.hostname)}\`)`;
      labels[`${router}.entrypoints`] = entrypoint;
      labels[`${router}.tls`] = String(tls);
      labels[`${router}.service`] = route.routerName;
      if (tls && config.certResolver) labels[`${router}.tls.certresolver`] = config.certResolver;
    }
    labels[`${service}.loadbalancer.server.port`] = String(route.port);

    if (!route.managedOrigin && tls && config.httpEntrypoint) {
      const redirectRouter = `traefik.http.routers.${route.routerName}-redirect`;
      const redirectMiddleware = `traefik.http.middlewares.${route.routerName}-https.redirectscheme`;
      labels[`${redirectRouter}.rule`] = `Host(\`${safeLabelValue(route.hostname)}\`)`;
      labels[`${redirectRouter}.entrypoints`] = config.httpEntrypoint;
      labels[`${redirectRouter}.service`] = route.routerName;
      labels[`${redirectRouter}.middlewares`] = `${route.routerName}-https@docker`;
      labels[`${redirectMiddleware}.scheme`] = "https";
      labels[`${redirectMiddleware}.permanent`] = "true";
    }

    const rootMiddleware =
      route.targetPath && route.targetPath !== "/" ? `${route.routerName}-root` : null;
    if (rootMiddleware) {
      labels[`traefik.http.middlewares.${rootMiddleware}.addprefix.prefix`] = route.targetPath!;
    }

    const rules = config.routeRules?.[route.hostname.trim().toLowerCase()] ?? [];
    for (const rule of rules) addMiddlewareLabels(labels, rule);

    const hostRules = rules.filter((rule) => !rule.pathPrefix);
    const hostMiddlewares = [
      ...(rootMiddleware ? [rootMiddleware] : []),
      ...hostRules.flatMap(middlewareNames),
    ];
    if (!route.managedOrigin && hostMiddlewares.length > 0) {
      labels[`${router}.middlewares`] = hostMiddlewares.map((name) => `${name}@docker`).join(",");
    }

    if (route.managedOrigin) {
      if (!config.managedOriginHost) {
        throw new Error("Managed route requires a Cloudflare origin hostname");
      }
      const originRouter = `traefik.http.routers.${route.routerName}-origin`;
      labels[`${originRouter}.rule`] =
        `Host(\`${safeLabelValue(config.managedOriginHost)}\`) && ` +
        `Header(\`x-vibrail-hostname\`, \`${safeLabelValue(route.hostname)}\`)`;
      labels[`${originRouter}.entrypoints`] = config.entrypoint;
      labels[`${originRouter}.tls`] = "true";
      labels[`${originRouter}.service`] = route.routerName;
      if (config.certResolver) labels[`${originRouter}.tls.certresolver`] = config.certResolver;
      const originMiddlewares = [
        addOriginAuthLabels(labels, `${route.routerName}-origin`, route.hostname),
        ...hostMiddlewares,
      ];
      if (originMiddlewares.length > 0) {
        labels[`${originRouter}.middlewares`] = originMiddlewares
          .map((name) => `${name}@docker`)
          .join(",");
      }
    }

    const pathGroups = new Map<string, TraefikRouteRuleConfig[]>();
    for (const rule of rules) {
      if (!rule.pathPrefix) continue;
      const group = pathGroups.get(rule.pathPrefix) ?? [];
      group.push(rule);
      pathGroups.set(rule.pathPrefix, group);
    }
    let pathIndex = 0;
    for (const [pathPrefix, pathRules] of pathGroups) {
      const pathRouterName = `${route.routerName}-rule-${pathIndex++}`;
      if (!SAFE_NAME.test(pathRouterName)) {
        throw new Error(`Invalid Traefik path router name: ${pathRouterName}`);
      }
      const pathRouter = `traefik.http.routers.${pathRouterName}`;
      if (!route.managedOrigin) {
        labels[`${pathRouter}.rule`] =
          `Host(\`${safeLabelValue(route.hostname)}\`) && PathPrefix(\`${safeLabelValue(pathPrefix)}\`)`;
        labels[`${pathRouter}.entrypoints`] = entrypoint;
        labels[`${pathRouter}.tls`] = String(tls);
        labels[`${pathRouter}.service`] = route.routerName;
        labels[`${pathRouter}.priority`] = String(10_000 + pathPrefix.length);
        if (tls && config.certResolver)
          labels[`${pathRouter}.tls.certresolver`] = config.certResolver;
      }
      // A more-specific path router wins over the base host router, so repeat
      // host-wide middlewares here before the path-specific chain.
      const names = [
        ...(rootMiddleware ? [rootMiddleware] : []),
        ...[...hostRules, ...pathRules].flatMap(middlewareNames),
      ];
      if (!route.managedOrigin && names.length > 0) {
        labels[`${pathRouter}.middlewares`] = names.map((name) => `${name}@docker`).join(",");
      }
      if (route.managedOrigin) {
        const originPathRouter = `traefik.http.routers.${pathRouterName}-origin`;
        labels[`${originPathRouter}.rule`] =
          `Host(\`${safeLabelValue(config.managedOriginHost!)}\`) && ` +
          `Header(\`x-vibrail-hostname\`, \`${safeLabelValue(route.hostname)}\`) && ` +
          `PathPrefix(\`${safeLabelValue(pathPrefix)}\`)`;
        labels[`${originPathRouter}.entrypoints`] = config.entrypoint;
        labels[`${originPathRouter}.tls`] = "true";
        labels[`${originPathRouter}.service`] = route.routerName;
        labels[`${originPathRouter}.priority`] = String(10_000 + pathPrefix.length);
        if (config.certResolver)
          labels[`${originPathRouter}.tls.certresolver`] = config.certResolver;
        const originNames = [
          addOriginAuthLabels(labels, `${pathRouterName}-origin`, route.hostname),
          ...names,
        ];
        if (originNames.length > 0) {
          labels[`${originPathRouter}.middlewares`] = originNames
            .map((name) => `${name}@docker`)
            .join(",");
        }
      }
    }
  }
  return labels;
}

/** Compile the same router/middleware surface as Docker labels, but point each
 * service at a host-native Bare process. The managed edge runs in the host
 * network namespace, so 127.0.0.1 is the deployment host rather than the
 * Traefik container itself. JSON is used because Traefik's file provider
 * accepts it natively and JSON.stringify gives us safe escaping. */
export function buildBareTraefikFileConfig(
  config: TraefikEdgeConfig,
  targetHost = "127.0.0.1",
): string {
  const routers: Record<string, Record<string, unknown>> = {};
  const services: Record<string, Record<string, unknown>> = {};
  const middlewares: Record<string, Record<string, unknown>> = {};

  const addRuleMiddlewares = (rule: TraefikRouteRuleConfig): string[] => {
    if (!SAFE_NAME.test(rule.name)) throw new Error(`Invalid Traefik rule name: ${rule.name}`);
    const names: string[] = [];
    if (rule.rateLimit) {
      const name = `${rule.name}-rate`;
      middlewares[name] = {
        rateLimit: {
          average: rule.rateLimit.average,
          period: "1s",
          burst: rule.rateLimit.burst,
        },
      };
      names.push(name);
    }
    if (rule.ipAllowList) {
      const name = `${rule.name}-ip`;
      middlewares[name] = {
        ipAllowList: { sourceRange: rule.ipAllowList.sourceRange.map(safeLabelValue) },
      };
      names.push(name);
    }
    if (rule.inFlightReq) {
      const name = `${rule.name}-flight`;
      middlewares[name] = { inFlightReq: { amount: rule.inFlightReq.amount } };
      names.push(name);
    }
    return names;
  };

  const addOriginAuthMiddleware = (routerName: string, hostname: string): string => {
    const name = originAuthMiddlewareName(routerName);
    middlewares[name] = {
      plugin: {
        "vibrail-origin-auth": {
          secretFile: "/etc/vibrail/edge/server-secret",
          previousSecretFile: "/etc/vibrail/edge/previous-server-secret",
          manifestDirectory: "/etc/vibrail/edge-routes",
          timestampSkewSeconds: 60,
          hostname,
        },
      },
    };
    return name;
  };

  for (const route of config.routes) {
    if (!SAFE_NAME.test(route.routerName)) {
      throw new Error(`Invalid Traefik router name: ${route.routerName}`);
    }
    if (!Number.isInteger(route.port) || route.port <= 0 || route.port > 65_535) {
      throw new Error(`Invalid Traefik target port: ${route.port}`);
    }
    const tls = route.tls ?? config.tls;
    const entrypoint = tls ? config.entrypoint : config.httpEntrypoint;
    if (!entrypoint) {
      throw new Error(
        `Traefik route ${route.hostname} requires a plain-HTTP entrypoint, but none was detected.`,
      );
    }
    services[route.routerName] = {
      loadBalancer: { servers: [{ url: `http://${targetHost}:${route.port}` }] },
    };

    const rootMiddleware =
      route.targetPath && route.targetPath !== "/" ? `${route.routerName}-root` : null;
    if (rootMiddleware) {
      middlewares[rootMiddleware] = { addPrefix: { prefix: route.targetPath } };
    }
    const rules = config.routeRules?.[route.hostname.trim().toLowerCase()] ?? [];
    const ruleMiddlewareNames = new Map<TraefikRouteRuleConfig, string[]>();
    for (const rule of rules) ruleMiddlewareNames.set(rule, addRuleMiddlewares(rule));
    const hostRules = rules.filter((rule) => !rule.pathPrefix);
    const hostMiddlewares = [
      ...(rootMiddleware ? [rootMiddleware] : []),
      ...hostRules.flatMap((rule) => ruleMiddlewareNames.get(rule) ?? []),
    ];

    if (!route.managedOrigin) {
      routers[route.routerName] = {
        rule: `Host(\`${safeLabelValue(route.hostname)}\`)`,
        entryPoints: [entrypoint],
        service: route.routerName,
        ...(tls ? { tls: config.certResolver ? { certResolver: config.certResolver } : {} } : {}),
        ...(hostMiddlewares.length > 0 ? { middlewares: hostMiddlewares } : {}),
      };
    }

    if (route.managedOrigin) {
      if (!config.managedOriginHost) {
        throw new Error("Managed route requires a Cloudflare origin hostname");
      }
      routers[`${route.routerName}-origin`] = {
        rule:
          `Host(\`${safeLabelValue(config.managedOriginHost)}\`) && ` +
          `Header(\`x-vibrail-hostname\`, \`${safeLabelValue(route.hostname)}\`)`,
        entryPoints: [config.entrypoint],
        service: route.routerName,
        tls: config.certResolver ? { certResolver: config.certResolver } : {},
        middlewares: [addOriginAuthMiddleware(`${route.routerName}-origin`, route.hostname), ...hostMiddlewares],
      };
    }

    if (!route.managedOrigin && tls && config.httpEntrypoint) {
      const redirectName = `${route.routerName}-https`;
      middlewares[redirectName] = { redirectScheme: { scheme: "https", permanent: true } };
      routers[`${route.routerName}-redirect`] = {
        rule: `Host(\`${safeLabelValue(route.hostname)}\`)`,
        entryPoints: [config.httpEntrypoint],
        service: route.routerName,
        middlewares: [redirectName],
      };
    }

    let pathIndex = 0;
    const pathGroups = new Map<string, TraefikRouteRuleConfig[]>();
    for (const rule of rules) {
      if (!rule.pathPrefix) continue;
      const group = pathGroups.get(rule.pathPrefix) ?? [];
      group.push(rule);
      pathGroups.set(rule.pathPrefix, group);
    }
    for (const [pathPrefix, pathRules] of pathGroups) {
      const name = `${route.routerName}-rule-${pathIndex++}`;
      const names = [
        ...(rootMiddleware ? [rootMiddleware] : []),
        ...[...hostRules, ...pathRules].flatMap((rule) => ruleMiddlewareNames.get(rule) ?? []),
      ];
      if (!route.managedOrigin) {
        routers[name] = {
          rule:
            `Host(\`${safeLabelValue(route.hostname)}\`) && ` +
            `PathPrefix(\`${safeLabelValue(pathPrefix)}\`)`,
          entryPoints: [entrypoint],
          service: route.routerName,
          priority: 10_000 + pathPrefix.length,
          ...(tls ? { tls: config.certResolver ? { certResolver: config.certResolver } : {} } : {}),
          ...(names.length > 0 ? { middlewares: names } : {}),
        };
      }
      if (route.managedOrigin) {
        routers[`${name}-origin`] = {
          rule:
            `Host(\`${safeLabelValue(config.managedOriginHost!)}\`) && ` +
            `Header(\`x-vibrail-hostname\`, \`${safeLabelValue(route.hostname)}\`) && ` +
            `PathPrefix(\`${safeLabelValue(pathPrefix)}\`)`,
          entryPoints: [config.entrypoint],
          service: route.routerName,
          priority: 10_000 + pathPrefix.length,
          tls: config.certResolver ? { certResolver: config.certResolver } : {},
          middlewares: [addOriginAuthMiddleware(`${name}-origin`, route.hostname), ...names],
        };
      }
    }
  }

  return `${JSON.stringify(
    {
      http: {
        routers,
        services,
        ...(Object.keys(middlewares).length > 0 ? { middlewares } : {}),
      },
    },
    null,
    2,
  )}\n`;
}
