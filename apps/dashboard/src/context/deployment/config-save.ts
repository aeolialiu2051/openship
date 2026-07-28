import type { EnvironmentVariable } from "@/components/import-project/types";
import type { ServiceInput } from "@/lib/api/services";
import type { ComposeServiceInfo } from "./types";

const MASKED_SECRET = "••••••••";

export interface SavedProjectEnvVar {
  key: string;
  value: string;
  environment: string;
  isSecret: boolean;
}

/**
 * Build the non-destructive project-env patch used by config-edit mode.
 * Existing secrets are hydrated into the wizard with an empty value; leaving
 * that row untouched must preserve the stored ciphertext rather than replace it
 * with an empty string. Removing the row is still an explicit delete.
 */
export function diffProjectEnvironment(
  saved: SavedProjectEnvVar[],
  draft: EnvironmentVariable[],
) {
  const production = saved.filter((env) => env.environment === "production");
  const savedByKey = new Map(production.map((env) => [env.key, env]));
  const draftByKey = new Map<string, EnvironmentVariable>();

  for (const row of draft) {
    const key = row.key.trim();
    if (key) draftByKey.set(key, { ...row, key });
  }

  const deletes = production
    .filter((env) => !draftByKey.has(env.key))
    .map((env) => env.key);
  const upserts: Array<{ key: string; value: string; isSecret: boolean }> = [];

  for (const [key, row] of draftByKey) {
    const existing = savedByKey.get(key);
    const keepsMaskedSecret =
      existing?.isSecret && (row.value === "" || row.value === MASKED_SECRET);
    if (keepsMaskedSecret) continue;

    const isSecret = existing?.isSecret ?? !row.visible;
    if (
      !existing ||
      existing.value !== row.value ||
      existing.isSecret !== isSecret
    ) {
      upserts.push({ key, value: row.value, isSecret });
    }
  }

  return { environment: "production" as const, upserts, deletes };
}

/** Serialize the wizard's richer UI shape to the services sync API. */
export function serializeComposeServices(
  services: ComposeServiceInfo[],
): ServiceInput[] {
  return services.map((service, sortOrder) => ({
    name: service.name,
    kind: "compose",
    image: service.image,
    build: service.build,
    dockerfile: service.dockerfile,
    ports: service.ports,
    dependsOn: service.dependsOn,
    environment: service.environment,
    volumes: service.volumes,
    command: service.command,
    restart: service.restart,
    advanced: service.advanced,
    exposed: service.exposed,
    exposedPort: service.exposedPort,
    domain: service.domain,
    customDomain: service.customDomain,
    domainType: service.domainType,
    publicEndpoints: service.publicEndpoints?.map((endpoint) => ({
      port: endpoint.port,
      domain: endpoint.domain,
      customDomain: endpoint.customDomain,
      domainType: endpoint.domainType,
    })),
    sortOrder,
  }));
}
