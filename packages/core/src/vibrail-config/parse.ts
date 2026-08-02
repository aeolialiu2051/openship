/**
 * Validate + coerce raw `vibrail.json` JSON into a typed {@link VibrailConfig}.
 *
 * Hand-rolled (no schema dep — mirrors the metadata parsers). Two audiences:
 *   - the deploy prepare pipeline overlays `config` leniently (ignores `errors`);
 *   - `vibrail config validate` fails when `errors` is non-empty.
 * Every field is optional; unknown top-level keys are warnings, not errors.
 */

import { STACK_IDS } from "../stacks";
import { ALL_PACKAGE_MANAGERS } from "../stacks";
import type { RoutingConfig } from "../metadata/types";
import {
  VIBRAIL_DOMAIN_TYPES,
  VIBRAIL_PRODUCTION_MODES,
  VIBRAIL_RESOURCE_TIERS,
  VIBRAIL_RESTARTS,
  VIBRAIL_RUNTIMES,
  type VibrailConfig,
  type VibrailDomain,
  type VibrailEnv,
  type VibrailHealthcheck,
  type VibrailMonorepo,
  type VibrailMonorepoApp,
  type VibrailResources,
  type VibrailService,
  type ParseResult,
} from "./schema";

const TOP_LEVEL_KEYS = new Set([
  "$schema",
  "framework",
  "packageManager",
  "rootDirectory",
  "installCommand",
  "buildCommand",
  "startCommand",
  "outputDirectory",
  "buildImage",
  "productionPaths",
  "runtime",
  "productionMode",
  "port",
  "env",
  "domains",
  "routes",
  "resources",
  "services",
  "monorepo",
]);

class Ctx {
  errors: string[] = [];
  warnings: string[] = [];
  err(path: string, msg: string): void {
    this.errors.push(`${path}: ${msg}`);
  }
  isObj(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }
  str(v: unknown, path: string): string | undefined {
    if (v === undefined) return undefined;
    if (typeof v !== "string") {
      this.err(path, "must be a string");
      return undefined;
    }
    return v;
  }
  bool(v: unknown, path: string): boolean | undefined {
    if (v === undefined) return undefined;
    if (typeof v !== "boolean") {
      this.err(path, "must be a boolean");
      return undefined;
    }
    return v;
  }
  int(v: unknown, path: string, min: number, max: number): number | undefined {
    if (v === undefined) return undefined;
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n !== "number" || !Number.isFinite(n)) {
      this.err(path, "must be a number");
      return undefined;
    }
    if (n < min || n > max) {
      this.err(path, `must be between ${min} and ${max}`);
      return undefined;
    }
    return n;
  }
  strArray(v: unknown, path: string): string[] | undefined {
    if (v === undefined) return undefined;
    if (!Array.isArray(v)) {
      this.err(path, "must be an array of strings");
      return undefined;
    }
    const out: string[] = [];
    v.forEach((item, i) => {
      if (typeof item !== "string") this.err(`${path}[${i}]`, "must be a string");
      else out.push(item);
    });
    return out;
  }
  enumOf<T extends string>(v: unknown, path: string, allowed: readonly T[]): T | undefined {
    if (v === undefined) return undefined;
    if (typeof v !== "string" || !allowed.includes(v as T)) {
      this.err(path, `must be one of: ${allowed.join(", ")}`);
      return undefined;
    }
    return v as T;
  }
}

function parseEnv(ctx: Ctx, v: unknown, path: string): VibrailEnv | undefined {
  if (v === undefined) return undefined;
  if (!ctx.isObj(v)) {
    ctx.err(path, "must be an object of environment variables");
    return undefined;
  }
  const out: VibrailEnv = {};
  for (const [key, val] of Object.entries(v)) {
    if (typeof val === "string") {
      out[key] = val;
    } else if (ctx.isObj(val)) {
      if (val.value === undefined) ctx.err(`${path}.${key}.value`, "is required");
      const value = ctx.str(val.value, `${path}.${key}.value`);
      const secret = ctx.bool(val.secret, `${path}.${key}.secret`);
      if (value !== undefined) out[key] = { value, ...(secret !== undefined ? { secret } : {}) };
    } else {
      ctx.err(`${path}.${key}`, 'must be a string or { "value", "secret" }');
    }
  }
  return out;
}

function parseDomains(ctx: Ctx, v: unknown, path: string): VibrailDomain[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) {
    ctx.err(path, "must be an array of hostnames or domain objects");
    return undefined;
  }
  const out: VibrailDomain[] = [];
  v.forEach((item, i) => {
    const p = `${path}[${i}]`;
    if (typeof item === "string") {
      out.push({ domain: item });
    } else if (ctx.isObj(item)) {
      const domain = ctx.str(item.domain, `${p}.domain`);
      if (!domain) {
        ctx.err(p, "requires a `domain`");
        return;
      }
      out.push({
        domain,
        port: ctx.int(item.port, `${p}.port`, 1, 65535),
        targetPath: ctx.str(item.targetPath, `${p}.targetPath`),
        type: ctx.enumOf(item.type, `${p}.type`, VIBRAIL_DOMAIN_TYPES),
      });
    } else {
      ctx.err(p, "must be a hostname string or a domain object");
    }
  });
  return out;
}

function parseRoutes(ctx: Ctx, v: unknown, path: string): RoutingConfig | undefined {
  if (v === undefined) return undefined;
  if (!ctx.isObj(v)) {
    ctx.err(path, "must be an object");
    return undefined;
  }
  const routes: RoutingConfig = {};
  const rule = (item: unknown, p: string): { source: string; destination: string } | null => {
    if (!ctx.isObj(item)) {
      ctx.err(p, "must be an object with `source` and `destination`");
      return null;
    }
    const source = ctx.str(item.source, `${p}.source`);
    const destination = ctx.str(item.destination, `${p}.destination`);
    return source && destination ? { source, destination } : null;
  };
  if (Array.isArray(v.rewrites)) {
    routes.rewrites = v.rewrites.map((r, i) => rule(r, `${path}.rewrites[${i}]`)).filter(Boolean) as RoutingConfig["rewrites"];
  } else if (v.rewrites !== undefined) ctx.err(`${path}.rewrites`, "must be an array");
  if (Array.isArray(v.redirects)) {
    routes.redirects = v.redirects
      .map((r, i) => {
        const base = rule(r, `${path}.redirects[${i}]`);
        if (!base) return null;
        const o = r as Record<string, unknown>;
        return {
          ...base,
          permanent: ctx.bool(o.permanent, `${path}.redirects[${i}].permanent`),
          statusCode: ctx.int(o.statusCode, `${path}.redirects[${i}].statusCode`, 300, 399),
        };
      })
      .filter(Boolean) as RoutingConfig["redirects"];
  } else if (v.redirects !== undefined) ctx.err(`${path}.redirects`, "must be an array");
  if (Array.isArray(v.headers)) {
    routes.headers = v.headers
      .map((h, i) => {
        const p = `${path}.headers[${i}]`;
        if (!ctx.isObj(h)) {
          ctx.err(p, "must be an object");
          return null;
        }
        const source = ctx.str(h.source, `${p}.source`);
        const list = Array.isArray(h.headers)
          ? (h.headers
              .map((kv, j) => {
                const key = ctx.str((kv as Record<string, unknown>)?.key, `${p}.headers[${j}].key`);
                const value = ctx.str((kv as Record<string, unknown>)?.value, `${p}.headers[${j}].value`);
                return key && value !== undefined ? { key, value } : null;
              })
              .filter(Boolean) as { key: string; value: string }[])
          : [];
        return source ? { source, headers: list } : null;
      })
      .filter(Boolean) as RoutingConfig["headers"];
  } else if (v.headers !== undefined) ctx.err(`${path}.headers`, "must be an array");
  const cleanUrls = ctx.bool(v.cleanUrls, `${path}.cleanUrls`);
  const trailingSlash = ctx.bool(v.trailingSlash, `${path}.trailingSlash`);
  if (cleanUrls !== undefined) routes.cleanUrls = cleanUrls;
  if (trailingSlash !== undefined) routes.trailingSlash = trailingSlash;
  return routes;
}

function parseResources(ctx: Ctx, v: unknown, path: string): VibrailResources | undefined {
  if (v === undefined) return undefined;
  if (!ctx.isObj(v)) {
    ctx.err(path, "must be an object");
    return undefined;
  }
  const r: VibrailResources = {
    tier: ctx.enumOf(v.tier, `${path}.tier`, VIBRAIL_RESOURCE_TIERS),
    cpuCores: ctx.int(v.cpuCores, `${path}.cpuCores`, 0.25, 4),
    memoryMb: ctx.int(v.memoryMb, `${path}.memoryMb`, 128, 8192),
    diskMb: ctx.int(v.diskMb, `${path}.diskMb`, 64, 204800),
  };
  return r;
}

function parseHealthcheck(ctx: Ctx, v: unknown, path: string): VibrailHealthcheck | undefined {
  if (v === undefined) return undefined;
  if (!ctx.isObj(v)) {
    ctx.err(path, "must be an object");
    return undefined;
  }
  const test =
    typeof v.test === "string"
      ? v.test
      : Array.isArray(v.test)
        ? ctx.strArray(v.test, `${path}.test`)
        : v.test !== undefined
          ? (ctx.err(`${path}.test`, "must be a string or array of strings"), undefined)
          : undefined;
  return {
    test,
    interval: ctx.str(v.interval, `${path}.interval`),
    timeout: ctx.str(v.timeout, `${path}.timeout`),
    retries: ctx.int(v.retries, `${path}.retries`, 0, 100),
    startPeriod: ctx.str(v.startPeriod, `${path}.startPeriod`),
    disable: ctx.bool(v.disable, `${path}.disable`),
  };
}

function parseServices(ctx: Ctx, v: unknown, path: string): VibrailService[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) {
    ctx.err(path, "must be an array of service objects");
    return undefined;
  }
  const out: VibrailService[] = [];
  v.forEach((item, i) => {
    const p = `${path}[${i}]`;
    if (!ctx.isObj(item)) {
      ctx.err(p, "must be an object");
      return;
    }
    const name = ctx.str(item.name, `${p}.name`);
    if (!name) {
      ctx.err(p, "requires a `name`");
      return;
    }
    out.push({
      name,
      image: ctx.str(item.image, `${p}.image`),
      build: ctx.str(item.build, `${p}.build`),
      dockerfile: ctx.str(item.dockerfile, `${p}.dockerfile`),
      ports: ctx.strArray(item.ports, `${p}.ports`),
      volumes: ctx.strArray(item.volumes, `${p}.volumes`),
      dependsOn: ctx.strArray(item.dependsOn, `${p}.dependsOn`),
      env: parseEnv(ctx, item.env, `${p}.env`),
      command: ctx.str(item.command, `${p}.command`),
      restart: ctx.enumOf(item.restart, `${p}.restart`, VIBRAIL_RESTARTS),
      exposed: ctx.bool(item.exposed, `${p}.exposed`),
      exposedPort: ctx.str(item.exposedPort, `${p}.exposedPort`),
      domain: ctx.str(item.domain, `${p}.domain`),
      healthcheck: parseHealthcheck(ctx, item.healthcheck, `${p}.healthcheck`),
    });
  });
  return out;
}

function parseMonorepo(ctx: Ctx, v: unknown, path: string): VibrailMonorepo | undefined {
  if (v === undefined) return undefined;
  if (!ctx.isObj(v)) {
    ctx.err(path, "must be an object");
    return undefined;
  }
  const mono: VibrailMonorepo = {};
  if (v.workspace !== undefined) {
    if (!ctx.isObj(v.workspace)) ctx.err(`${path}.workspace`, "must be an object");
    else {
      const pm = ctx.str(v.workspace.packageManager, `${path}.workspace.packageManager`);
      if (pm) {
        mono.workspace = {
          packageManager: pm,
          prepareCommand: ctx.str(v.workspace.prepareCommand, `${path}.workspace.prepareCommand`),
        };
      } else {
        ctx.err(`${path}.workspace`, "requires a `packageManager`");
      }
    }
  }
  if (v.sharedPaths !== undefined) {
    ctx.warnings.push(`${path}.sharedPaths is not applied yet (ignored)`);
  }
  if (v.apps !== undefined) {
    if (!Array.isArray(v.apps)) ctx.err(`${path}.apps`, "must be an array");
    else {
      const apps: VibrailMonorepoApp[] = [];
      v.apps.forEach((a, i) => {
        const p = `${path}.apps[${i}]`;
        if (!ctx.isObj(a)) {
          ctx.err(p, "must be an object");
          return;
        }
        const name = ctx.str(a.name, `${p}.name`);
        const rootDirectory = ctx.str(a.rootDirectory, `${p}.rootDirectory`);
        if (!name || !rootDirectory) {
          ctx.err(p, "requires `name` and `rootDirectory`");
          return;
        }
        apps.push({
          name,
          rootDirectory,
          framework: ctx.enumOf(a.framework, `${p}.framework`, STACK_IDS),
          packageManager: parsePackageManager(ctx, a.packageManager, `${p}.packageManager`),
          installCommand: ctx.str(a.installCommand, `${p}.installCommand`),
          buildCommand: ctx.str(a.buildCommand, `${p}.buildCommand`),
          startCommand: ctx.str(a.startCommand, `${p}.startCommand`),
          outputDirectory: ctx.str(a.outputDirectory, `${p}.outputDirectory`),
          buildImage: ctx.str(a.buildImage, `${p}.buildImage`),
          port: ctx.int(a.port, `${p}.port`, 1, 65535),
        });
      });
      mono.apps = apps;
    }
  }
  return mono;
}

function parsePackageManager(ctx: Ctx, v: unknown, path: string): string | undefined {
  const s = ctx.str(v, path);
  if (s === undefined) return undefined;
  if (!ALL_PACKAGE_MANAGERS.includes(s)) {
    ctx.err(path, `must be one of: ${ALL_PACKAGE_MANAGERS.join(", ")}`);
    return undefined;
  }
  return s;
}

/** Parse + validate raw `vibrail.json` JSON (already `JSON.parse`d) into a config. */
export function parseVibrailConfig(raw: unknown): ParseResult {
  const ctx = new Ctx();
  if (!ctx.isObj(raw)) {
    return { config: null, errors: ["vibrail.json must be a JSON object"], warnings: [] };
  }

  for (const key of Object.keys(raw)) {
    if (!TOP_LEVEL_KEYS.has(key)) ctx.warnings.push(`Unknown field "${key}" (ignored)`);
  }

  const config: VibrailConfig = {
    framework: ctx.enumOf(raw.framework, "framework", STACK_IDS),
    packageManager: parsePackageManager(ctx, raw.packageManager, "packageManager"),
    rootDirectory: ctx.str(raw.rootDirectory, "rootDirectory"),
    installCommand: ctx.str(raw.installCommand, "installCommand"),
    buildCommand: ctx.str(raw.buildCommand, "buildCommand"),
    startCommand: ctx.str(raw.startCommand, "startCommand"),
    outputDirectory: ctx.str(raw.outputDirectory, "outputDirectory"),
    buildImage: ctx.str(raw.buildImage, "buildImage"),
    productionPaths: ctx.strArray(raw.productionPaths, "productionPaths"),
    runtime: ctx.enumOf(raw.runtime, "runtime", VIBRAIL_RUNTIMES),
    productionMode: ctx.enumOf(raw.productionMode, "productionMode", VIBRAIL_PRODUCTION_MODES),
    port: ctx.int(raw.port, "port", 1, 65535),
    env: parseEnv(ctx, raw.env, "env"),
    domains: parseDomains(ctx, raw.domains, "domains"),
    routes: parseRoutes(ctx, raw.routes, "routes"),
    resources: parseResources(ctx, raw.resources, "resources"),
    services: parseServices(ctx, raw.services, "services"),
    monorepo: parseMonorepo(ctx, raw.monorepo, "monorepo"),
  };

  // Strip undefined so the overlay only carries fields the user actually declared.
  for (const k of Object.keys(config) as (keyof VibrailConfig)[]) {
    if (config[k] === undefined) delete config[k];
  }

  return { config, errors: ctx.errors, warnings: ctx.warnings };
}

/** Convenience: parse a raw JSON string. Returns a JSON-parse error in `errors`. */
export function parseVibrailConfigJson(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return {
      config: null,
      errors: [`invalid JSON: ${err instanceof Error ? err.message : String(err)}`],
      warnings: [],
    };
  }
  return parseVibrailConfig(raw);
}
