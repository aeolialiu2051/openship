import { beforeEach, describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../schema";
import { createServiceRepo } from "./service.repo";

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

async function freshRepo() {
  const client = new PGlite("memory://");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  await client.exec("SET session_replication_role = replica;");
  return createServiceRepo(db);
}

describe("service repo compose reconciliation", () => {
  let repo: Awaited<ReturnType<typeof freshRepo>>;

  beforeEach(async () => {
    repo = await freshRepo();
  }, 30_000);

  it("stores the initial compose spec so the first repo env change is applied", async () => {
    await repo.syncFromCompose("project-1", [
      { name: "app", image: "example/app:latest", environment: { APP_VERSION: "1" } },
    ]);

    const imported = await repo.findByName("project-1", "app");
    expect(imported?.importedSpec?.environment).toEqual({ APP_VERSION: "1" });

    await repo.reconcileFromCompose("project-1", [
      { name: "app", image: "example/app:latest", environment: { APP_VERSION: "2" } },
    ]);

    const reconciled = await repo.findByName("project-1", "app");
    expect(reconciled?.environment).toEqual({ APP_VERSION: "2" });
    expect(reconciled?.importedSpec?.environment).toEqual({ APP_VERSION: "2" });
    expect(reconciled?.driftSpec).toBeNull();
  });

  it("preserves omitted services unless replacement is explicit", async () => {
    await repo.syncFromCompose("project-1", [
      { name: "app", image: "example/app:latest" },
      { name: "postgres", image: "postgres:18-alpine" },
      { name: "redis", image: "redis:8-alpine" },
    ]);

    await repo.syncFromCompose("project-1", [{ name: "app", image: "example/app:v2" }]);
    expect((await repo.listByProject("project-1")).map((service) => service.name).sort()).toEqual([
      "app",
      "postgres",
      "redis",
    ]);

    await repo.syncFromCompose(
      "project-1",
      [{ name: "app", image: "example/app:v2" }],
      { removeMissing: true },
    );
    expect((await repo.listByProject("project-1")).map((service) => service.name)).toEqual([
      "app",
    ]);
  });

  it("keeps operator edits and records later upstream compose env drift", async () => {
    await repo.syncFromCompose("project-1", [{ name: "app", environment: { LOG_LEVEL: "info" } }]);
    const imported = await repo.findByName("project-1", "app");
    await repo.update(imported!.id, { environment: { LOG_LEVEL: "debug" } });

    const result = await repo.reconcileFromCompose("project-1", [
      { name: "app", environment: { LOG_LEVEL: "warn" } },
    ]);

    const reconciled = await repo.findByName("project-1", "app");
    expect(result.driftedNames).toEqual(["app"]);
    expect(reconciled?.environment).toEqual({ LOG_LEVEL: "debug" });
    expect(reconciled?.driftSpec?.environment).toEqual({ LOG_LEVEL: "warn" });
  });

  it("auto-applies unrelated upstream env keys while preserving a local-only key", async () => {
    await repo.syncFromCompose("project-1", [
      { name: "app", environment: { APP_VERSION: "1", LOG_LEVEL: "info" } },
    ]);
    const imported = await repo.findByName("project-1", "app");
    await repo.update(imported!.id, {
      environment: { APP_VERSION: "1", LOG_LEVEL: "info", LOCAL_OVERRIDE: "kept" },
    });

    const result = await repo.reconcileFromCompose("project-1", [
      {
        name: "app",
        environment: {
          APP_VERSION: "2",
          LOG_LEVEL: "info",
          DEFAULT_AGENT_NAME: "seekpeace",
        },
      },
    ]);

    const reconciled = await repo.findByName("project-1", "app");
    expect(result.driftedNames).toEqual([]);
    expect(reconciled?.environment).toEqual({
      APP_VERSION: "2",
      LOG_LEVEL: "info",
      LOCAL_OVERRIDE: "kept",
      DEFAULT_AGENT_NAME: "seekpeace",
    });
    expect(reconciled?.driftSpec).toBeNull();
  });

  it("applies non-conflicting repo keys even when one env key has a real conflict", async () => {
    await repo.syncFromCompose("project-1", [
      { name: "app", environment: { LOG_LEVEL: "info", APP_VERSION: "1" } },
    ]);
    const imported = await repo.findByName("project-1", "app");
    await repo.update(imported!.id, {
      environment: { LOG_LEVEL: "debug", APP_VERSION: "1" },
    });

    const result = await repo.reconcileFromCompose("project-1", [
      {
        name: "app",
        environment: {
          LOG_LEVEL: "warn",
          APP_VERSION: "2",
          DEFAULT_AGENT_MODEL: "gpt-5.6-sol",
        },
      },
    ]);

    const reconciled = await repo.findByName("project-1", "app");
    expect(result.driftedNames).toEqual(["app"]);
    expect(reconciled?.environment).toEqual({
      LOG_LEVEL: "debug",
      APP_VERSION: "2",
      DEFAULT_AGENT_MODEL: "gpt-5.6-sol",
    });
    expect(reconciled?.importedSpec?.environment).toEqual({
      LOG_LEVEL: "info",
      APP_VERSION: "2",
      DEFAULT_AGENT_MODEL: "gpt-5.6-sol",
    });
  });

  it("upserts repeated deployment status writes for the same service", async () => {
    await repo.createServiceDeployment({
      deploymentId: "deployment-1",
      serviceId: "service-1",
      serviceName: "db",
      status: "success",
      imageRef: "pgvector/pgvector:pg16",
    });

    await repo.upsertServiceDeployment({
      deploymentId: "deployment-1",
      serviceId: "service-1",
      serviceName: "db",
      status: "failure",
      imageRef: "pgvector/pgvector:pg16",
      errorMessage: "container health check failed",
      error: "container health check failed",
    });

    const rows = await repo.listByDeployment("deployment-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      serviceName: "db",
      status: "failure",
      errorMessage: "container health check failed",
    });
  });
});
