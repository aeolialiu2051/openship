import { beforeEach, describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../schema";
import { createUpdateStatusRepo } from "./update-status.repo";

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

async function freshRepo() {
  const client = new PGlite("memory://");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  await client.exec("SET session_replication_role = replica;");
  return createUpdateStatusRepo(db);
}

describe("updateStatus repo lifecycle settlement", () => {
  let repo: Awaited<ReturnType<typeof freshRepo>>;

  beforeEach(async () => {
    repo = await freshRepo();
  }, 30_000);

  async function seedInProgress() {
    await repo.upsert({
      organizationId: "org_1",
      projectId: "proj_1",
      kind: "release",
      behind: true,
      latestInProgress: true,
      currentLabel: "1.0.0",
      latestLabel: "1.1.0",
    });
  }

  it("makes a failed or cancelled update retryable", async () => {
    await seedInProgress();

    await repo.markNotInProgress("proj_1");

    expect(await repo.getByProject("proj_1")).toMatchObject({
      behind: true,
      latestInProgress: false,
    });
  });

  it("removes stale drift after an update succeeds", async () => {
    await seedInProgress();

    await repo.deleteByProject("proj_1");

    expect(await repo.getByProject("proj_1")).toBeUndefined();
  });
});
