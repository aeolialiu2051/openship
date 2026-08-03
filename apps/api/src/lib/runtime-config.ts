import { repos } from "@repo/db";
import { z } from "zod";
import { env } from "../config/env";
import { AppError } from "@repo/core";

export const runtimeConfigSchema = z.object({
  BILLING_ENABLED: z.boolean(),
  BILLING_TOPUPS_ENABLED: z.boolean(),
  CLOUD_MAX_PROJECTS_PER_USER: z.number().int().min(1).max(10_000),
  CLOUD_SESSION_PINNING: z.enum(["off", "warn", "strict"]),
  NOTIFY_WEBHOOK_ALLOW_INTERNAL: z.boolean(),
  VIBRAIL_CLOUDFLARE_PROXY: z.boolean(),
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;
export type RuntimeConfigKey = keyof RuntimeConfig;
export type RuntimeConfigOverrides = Partial<RuntimeConfig>;
export interface RuntimeConfigState {
  values: RuntimeConfig;
  overrides: RuntimeConfigOverrides;
  environmentDefaults: RuntimeConfig;
}

const environmentDefaults: RuntimeConfig = {
  BILLING_ENABLED: env.BILLING_ENABLED,
  BILLING_TOPUPS_ENABLED: env.BILLING_TOPUPS_ENABLED,
  CLOUD_MAX_PROJECTS_PER_USER: env.CLOUD_MAX_PROJECTS_PER_USER,
  CLOUD_SESSION_PINNING: env.CLOUD_SESSION_PINNING,
  NOTIFY_WEBHOOK_ALLOW_INTERNAL: env.NOTIFY_WEBHOOK_ALLOW_INTERNAL,
  VIBRAIL_CLOUDFLARE_PROXY: env.VIBRAIL_CLOUDFLARE_PROXY,
};

function parseStoredOverrides(value: unknown): RuntimeConfigOverrides {
  const parsed = runtimeConfigSchema.partial().safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

export async function getRuntimeConfigState(): Promise<RuntimeConfigState> {
  const row = await repos.instanceSettings.get();
  const overrides = parseStoredOverrides(row?.runtimeConfig);
  return {
    values: { ...environmentDefaults, ...overrides },
    overrides,
    environmentDefaults,
  };
}

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  return (await getRuntimeConfigState()).values;
}

export async function updateRuntimeConfig(
  patch: Partial<Record<RuntimeConfigKey, unknown | null>>,
): Promise<RuntimeConfigState> {
  const allowedKeys = new Set(Object.keys(environmentDefaults) as RuntimeConfigKey[]);
  for (const key of Object.keys(patch)) {
    if (!allowedKeys.has(key as RuntimeConfigKey)) {
      throw new AppError(
        `Unsupported runtime configuration key: ${key}`,
        400,
        "INVALID_RUNTIME_CONFIG",
      );
    }
  }

  const current = await repos.instanceSettings.get();
  const next: Record<string, unknown> = { ...parseStoredOverrides(current?.runtimeConfig) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }

  const overrides = runtimeConfigSchema.partial().parse(next);
  await repos.instanceSettings.upsert({ runtimeConfig: overrides });
  return getRuntimeConfigState();
}
