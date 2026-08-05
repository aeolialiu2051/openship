import { repos } from "@repo/db";
import { z } from "zod";
import { env } from "../config/env";
import { AppError } from "@repo/core";
import { decryptSecretField, encryptSecretField } from "./credential-encryption";

const SECRET_MASK = "••••••••";
const SECRET_KEYS = new Set(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);

export const runtimeConfigSchema = z.object({
  CLOUD_MAX_PROJECTS_PER_USER: z.number().int().min(1).max(10_000),
  CLOUD_SESSION_PINNING: z.enum(["off", "warn", "strict"]),
  NOTIFY_WEBHOOK_ALLOW_INTERNAL: z.boolean(),
  VIBRAIL_CLOUDFLARE_PROXY: z.boolean(),
  STRIPE_SECRET_KEY: z.string(),
  STRIPE_WEBHOOK_SECRET: z.string(),
  STRIPE_PRICE_PRO_MONTHLY_ID: z.string().max(255),
  STRIPE_PRICE_PRO_ANNUAL_ID: z.string().max(255),
  STRIPE_PRICE_PRO_MONTHLY_PROMOTIONAL_ID: z.string().max(255),
  STRIPE_PRICE_PRO_ANNUAL_PROMOTIONAL_ID: z.string().max(255),
});

export type EditableRuntimeConfig = z.infer<typeof runtimeConfigSchema>;
export type RuntimeConfig = EditableRuntimeConfig & {
  BILLING_ENABLED: boolean;
  BILLING_TOPUPS_ENABLED: boolean;
};
export type RuntimeConfigKey = keyof EditableRuntimeConfig;
export type RuntimeConfigOverrides = Partial<EditableRuntimeConfig>;
export interface RuntimeConfigState {
  values: EditableRuntimeConfig;
  overrides: RuntimeConfigOverrides;
  environmentDefaults: EditableRuntimeConfig;
}

const environmentDefaults: EditableRuntimeConfig = {
  CLOUD_MAX_PROJECTS_PER_USER: env.CLOUD_MAX_PROJECTS_PER_USER,
  CLOUD_SESSION_PINNING: env.CLOUD_SESSION_PINNING,
  NOTIFY_WEBHOOK_ALLOW_INTERNAL: env.NOTIFY_WEBHOOK_ALLOW_INTERNAL,
  VIBRAIL_CLOUDFLARE_PROXY: env.VIBRAIL_CLOUDFLARE_PROXY,
  STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY ?? "",
  STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET ?? "",
  STRIPE_PRICE_PRO_MONTHLY_ID: env.STRIPE_PRICE_PRO_MONTHLY_ID,
  STRIPE_PRICE_PRO_ANNUAL_ID: env.STRIPE_PRICE_PRO_ANNUAL_ID,
  STRIPE_PRICE_PRO_MONTHLY_PROMOTIONAL_ID: env.STRIPE_PRICE_PRO_MONTHLY_PROMOTIONAL_ID,
  STRIPE_PRICE_PRO_ANNUAL_PROMOTIONAL_ID: env.STRIPE_PRICE_PRO_ANNUAL_PROMOTIONAL_ID,
};

function parseStoredOverrides(value: unknown): RuntimeConfigOverrides {
  const record = value && typeof value === "object" ? { ...(value as Record<string, unknown>) } : {};
  // Billing feature flags used to be runtime-editable. Ignore any legacy
  // values so the deployment environment is now the sole source of truth.
  delete record.BILLING_ENABLED;
  delete record.BILLING_TOPUPS_ENABLED;
  for (const key of SECRET_KEYS) {
    const stored = record[key];
    if (typeof stored === "string") {
      try {
        record[key] = decryptSecretField(stored) ?? "";
      } catch {
        delete record[key];
      }
    }
  }
  const parsed = runtimeConfigSchema.partial().safeParse(record);
  return parsed.success ? parsed.data : {};
}

function maskSecrets(config: EditableRuntimeConfig): EditableRuntimeConfig {
  return {
    ...config,
    STRIPE_SECRET_KEY: config.STRIPE_SECRET_KEY ? SECRET_MASK : "",
    STRIPE_WEBHOOK_SECRET: config.STRIPE_WEBHOOK_SECRET ? SECRET_MASK : "",
  };
}

function maskOverrides(overrides: RuntimeConfigOverrides): RuntimeConfigOverrides {
  return {
    ...overrides,
    ...(overrides.STRIPE_SECRET_KEY !== undefined
      ? { STRIPE_SECRET_KEY: overrides.STRIPE_SECRET_KEY ? SECRET_MASK : "" }
      : {}),
    ...(overrides.STRIPE_WEBHOOK_SECRET !== undefined
      ? { STRIPE_WEBHOOK_SECRET: overrides.STRIPE_WEBHOOK_SECRET ? SECRET_MASK : "" }
      : {}),
  };
}

async function readResolvedConfig(): Promise<{
  values: EditableRuntimeConfig;
  overrides: RuntimeConfigOverrides;
}> {
  const row = await repos.instanceSettings.get();
  const overrides = parseStoredOverrides(row?.runtimeConfig);
  return { values: { ...environmentDefaults, ...overrides }, overrides };
}

export async function getRuntimeConfigState(): Promise<RuntimeConfigState> {
  const { values, overrides } = await readResolvedConfig();
  return {
    values: maskSecrets(values),
    overrides: maskOverrides(overrides),
    environmentDefaults: maskSecrets(environmentDefaults),
  };
}

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  const { values } = await readResolvedConfig();
  return {
    ...values,
    BILLING_ENABLED: env.BILLING_ENABLED,
    BILLING_TOPUPS_ENABLED: env.BILLING_TOPUPS_ENABLED,
  };
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
  const stored = current?.runtimeConfig ?? {};
  const nextPlain: Record<string, unknown> = { ...parseStoredOverrides(stored) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete nextPlain[key];
    } else if (SECRET_KEYS.has(key) && (value === SECRET_MASK || value === "")) {
      // Blank or masked values mean "leave the existing secret unchanged".
      continue;
    } else {
      nextPlain[key] = value;
    }
  }

  const overrides = runtimeConfigSchema.partial().parse(nextPlain);
  const storedOverrides: Record<string, unknown> = { ...overrides };
  for (const key of SECRET_KEYS) {
    const value = storedOverrides[key];
    if (typeof value === "string") storedOverrides[key] = encryptSecretField(value);
  }
  await repos.instanceSettings.upsert({ runtimeConfig: storedOverrides });
  return getRuntimeConfigState();
}
