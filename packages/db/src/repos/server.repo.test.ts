import { beforeEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../schema";
import { createServerRepo } from "./server.repo";

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

async function freshRepo() {
  const client = new PGlite("memory://");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  await client.exec("SET session_replication_role = replica;");
  return createServerRepo(db);
}

describe("server.repo endpoint lookup", () => {
  let repo: Awaited<ReturnType<typeof freshRepo>>;

  beforeEach(async () => {
    repo = await freshRepo();
    await repo.create({
      organizationId: "org_1",
      name: "Production",
      sshHost: "VPS.EXAMPLE.COM",
      sshPort: 22,
      sshUser: "root",
    });
  }, 30_000);

  it("matches the same host case-insensitively inside the organization", async () => {
    const existing = await repo.findByEndpointInOrganization("org_1", "vps.example.com", 22);
    expect(existing?.name).toBe("Production");
  });

  it("allows the same endpoint in a different organization", async () => {
    const existing = await repo.findByEndpointInOrganization("org_2", "vps.example.com", 22);
    expect(existing).toBeUndefined();
  });

  it("can exclude the row being edited", async () => {
    const current = await repo.findByEndpointInOrganization("org_1", "vps.example.com", 22);
    const existing = await repo.findByEndpointInOrganization(
      "org_1",
      "vps.example.com",
      22,
      current?.id,
    );
    expect(existing).toBeUndefined();
  });
});
