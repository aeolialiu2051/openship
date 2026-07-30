/**
 * Pure decision logic for HOW a single-app deploy builds and serves — extracted
 * from build-pipeline.ts so the pipeline reads as a sequence and the three
 * interleaved axes (target / runtime / static-vs-server) are decided as DATA,
 * not via a `snapshot.runtimeMode` mutate-then-undo + scattered `instanceof`.
 *
 * Two steps, matching the pipeline's ordering:
 *   1. resolveBuildRuntimeModes — BEFORE platform resolution: what runtimeMode to
 *      resolve the BUILD with, and what to PERSIST as the serve/lifecycle identity.
 *   2. resolveDeployRouting — AFTER resolution (needs the concrete runtime): how to
 *      route the build + deploy. Keyed off the resolved runtime's `.name`, exactly
 *      as the old inline `instanceof` checks were.
 */

export type BuildMode = "static-sandbox" | "static-bare" | "normal";
export type DeployMode = "static-edge" | "static-container" | "static-file-serve" | "server";
export type RuntimeModeValue = "bare" | "docker";

export interface BuildRuntimeModes {
  /** runtimeMode to RESOLVE the platform with for the build; `undefined` = use the
   *  snapshot's own runtimeMode unchanged. */
  buildRuntimeMode: RuntimeModeValue | undefined;
  /** runtimeMode to PERSIST as the deployment's serve/lifecycle identity;
   *  `undefined` = leave the snapshot's runtimeMode unchanged. */
  serveRuntimeMode: RuntimeModeValue | undefined;
}

export interface DeployRouting {
  buildMode: BuildMode;
  deployMode: DeployMode;
  /** outputDirectory to serve a static file-serve deploy from ("" when the doc-root
   *  was already extracted by a Docker sandbox build). */
  staticServeOutputDir: string;
}

/** Resolve the container port advertised to Traefik for a planned route.
 * Explicit port routes always win. A path route needs the static HTTP
 * container's runtime port; bare file-serving routes have no container port. */
export function resolveTraefikRoutePort(input: {
  targetPort?: number;
  targetPath?: string;
  isStaticContainer: boolean;
  runtimePort: number;
}): number | undefined {
  if (input.targetPort !== undefined) return input.targetPort;
  if (input.isStaticContainer && input.targetPath) return input.runtimePort;
  return undefined;
}

/**
 * The runtime-mode decision, made BEFORE platform resolution. Encodes the two
 * historical "flips" as data:
 *   - services → Docker (containers can't run bare) for build AND serve.
 *   - a static app on a self-hosted host → build and serve the generated HTTP
 *     image with Docker so Traefik labels and lifecycle operations address the
 *     same container runtime.
 * Cloud static and Docker-less desktop-local static are left to their own runtime.
 */
export function resolveBuildRuntimeModes(input: {
  hasServer: boolean;
  serverId: string | null | undefined;
  baseTarget: "desktop" | "selfhosted" | "cloud";
  effectiveTarget: "local" | "server" | "cloud";
  willRunServices: boolean;
}): BuildRuntimeModes {
  if (input.willRunServices) {
    return { buildRuntimeMode: "docker", serveRuntimeMode: "docker" };
  }
  if (
    !input.hasServer &&
    input.effectiveTarget !== "cloud" &&
    (!!input.serverId || input.baseTarget === "selfhosted")
  ) {
    return { buildRuntimeMode: "docker", serveRuntimeMode: "docker" };
  }
  return { buildRuntimeMode: undefined, serveRuntimeMode: undefined };
}

/**
 * The build + deploy routing, made AFTER platform resolution — keyed off the
 * resolved runtime's `.name` (the ground truth), which is exactly what the old
 * inline `runtime instanceof …` checks did. Centralizing them here is the point:
 * one place decides static-sandbox vs static-bare vs normal, and static-edge
 * (cloud) vs static-file-serve vs server.
 */
export function resolveDeployRouting(input: {
  hasServer: boolean;
  runtimeName: string; // "bare" | "docker" | "cloud"
  outputDirectory: string;
}): DeployRouting {
  if (input.hasServer) {
    return { buildMode: "normal", deployMode: "server", staticServeOutputDir: "" };
  }
  // Static, cloud target → Oblien Pages (executeStaticEdgeDeploy); build via CloudRuntime.
  if (input.runtimeName === "cloud") {
    return { buildMode: "normal", deployMode: "static-edge", staticServeOutputDir: "" };
  }
  // Static Docker builds already produce a minimal HTTP image. Keep that image
  // and deploy it as a normal Traefik-routed workload. Only Docker-less bare
  // targets retain the filesystem release mode for operator-managed ingress.
  const dockerBuilt = input.runtimeName === "docker";
  if (dockerBuilt) {
    return { buildMode: "normal", deployMode: "static-container", staticServeOutputDir: "" };
  }
  return {
    buildMode: "static-bare",
    deployMode: "static-file-serve",
    staticServeOutputDir: input.outputDirectory,
  };
}
