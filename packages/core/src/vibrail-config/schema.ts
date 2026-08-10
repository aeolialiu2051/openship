/**
 * `vibrail.json` — the native, declarative deploy config (à la vercel.json /
 * railway.toml). A repo-root file that tells Vibrail how to build, run, route,
 * and scale a project, covering the deploy wizard's options. It's an
 * AUTHORITATIVE OVERLAY: auto-detection runs first, then each field present here
 * overrides it (absent fields keep the detected value). It seeds the wizard and
 * is authoritative for headless deploys (auto-deploy on push, `vibrail deploy`).
 *
 * This is the typed shape. `parse.ts` validates/coerces raw JSON into it; the
 * published JSON Schema (for editor autocomplete) is generated from the same
 * field set. Every field maps 1:1 to an existing API option — see the docs
 * reference page for the mapping table.
 */

import type { StackId } from "../stacks";
import type { RoutingConfig } from "../metadata/types";

/** User workloads deployed to a server always run in Docker. */
export type VibrailRuntime = "docker";
export type VibrailProductionMode = "host" | "static" | "standalone";
export type VibrailDomainType = "free" | "custom";
export type VibrailRestart = "no" | "always" | "on-failure" | "unless-stopped";
export type VibrailResourceTier = "micro" | "low" | "medium" | "high";

export const VIBRAIL_RUNTIMES: readonly VibrailRuntime[] = ["docker"];
export const VIBRAIL_PRODUCTION_MODES: readonly VibrailProductionMode[] = [
  "host",
  "static",
  "standalone",
];
export const VIBRAIL_DOMAIN_TYPES: readonly VibrailDomainType[] = ["free", "custom"];
export const VIBRAIL_RESTARTS: readonly VibrailRestart[] = [
  "no",
  "always",
  "on-failure",
  "unless-stopped",
];
export const VIBRAIL_RESOURCE_TIERS: readonly VibrailResourceTier[] = [
  "micro",
  "low",
  "medium",
  "high",
];

/** Env value: a plain string, or `{ value, secret }` to encrypt it at rest. */
export type VibrailEnvValue = { value: string; secret?: boolean };
export type VibrailEnv = Record<string, string | VibrailEnvValue>;

export interface VibrailDomain {
  /** Hostname. A `.vibrail.app`-style label = a free subdomain; anything with a dot = custom. */
  domain: string;
  /** Which service/exposed port this hostname routes to (defaults to the app port). */
  port?: number;
  /** Path prefix on the target (defaults to "/"). */
  targetPath?: string;
  type?: VibrailDomainType;
}

export interface VibrailHealthcheck {
  test?: string | string[];
  interval?: string;
  timeout?: string;
  retries?: number;
  startPeriod?: string;
  disable?: boolean;
}

export interface VibrailService {
  name: string;
  image?: string;
  build?: string;
  dockerfile?: string;
  ports?: string[];
  volumes?: string[];
  dependsOn?: string[];
  env?: VibrailEnv;
  command?: string;
  restart?: VibrailRestart;
  exposed?: boolean;
  exposedPort?: string;
  domain?: string;
  healthcheck?: VibrailHealthcheck;
}

/**
 * Per-sub-app overrides for a monorepo. These override what the detector found
 * for the sub-app at `rootDirectory` (matched by path). Only build-shaping
 * fields are supported in v1 — per-app `domain`/`env`/`exposed` are set in the
 * wizard, not here (declare shared vars under the top-level `env`/`domains`).
 */
export interface VibrailMonorepoApp {
  name: string;
  rootDirectory: string;
  framework?: StackId;
  packageManager?: string;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  outputDirectory?: string;
  buildImage?: string;
  port?: number;
}

export interface VibrailMonorepo {
  workspace?: { packageManager: string; prepareCommand?: string };
  apps?: VibrailMonorepoApp[];
}

/** Cloud sizing tier OR an explicit production resource allocation. */
export interface VibrailResources {
  tier?: VibrailResourceTier;
  cpuCores?: number;
  memoryMb?: number;
  diskMb?: number;
}

export interface VibrailConfig {
  // ── Build ──
  framework?: StackId;
  packageManager?: string;
  rootDirectory?: string;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  outputDirectory?: string;
  buildImage?: string;
  productionPaths?: string[];
  // ── Runtime ──
  runtime?: VibrailRuntime;
  productionMode?: VibrailProductionMode;
  port?: number;
  // ── Env ──
  env?: VibrailEnv;
  // ── Domains + routing ──
  domains?: VibrailDomain[];
  routes?: RoutingConfig;
  // ── Resources ──
  resources?: VibrailResources;
  // ── Services (compose) ──
  services?: VibrailService[];
  // ── Monorepo ──
  monorepo?: VibrailMonorepo;
}

export interface ParseResult {
  /** Valid fields, partial — only what parsed cleanly. null if `raw` isn't an object. */
  config: VibrailConfig | null;
  /** Hard validation failures (bad type / unknown enum / out-of-range). */
  errors: string[];
  /** Soft issues (unknown keys) — non-fatal; the field is ignored. */
  warnings: string[];
}
