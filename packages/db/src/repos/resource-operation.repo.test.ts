import { beforeEach, describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../schema";
import { createResourceOperationRepo } from "./resource-operation.repo";

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

async function freshRepo() {
  const client = new PGlite("memory://");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  // The repository contract is under test; parent org/user fixtures are not.
  await client.exec("SET session_replication_role = replica;");
  return createResourceOperationRepo(db);
}

describe("resourceOperation repo", () => {
  let repo: Awaited<ReturnType<typeof freshRepo>>;

  beforeEach(async () => {
    repo = await freshRepo();
  }, 30_000);

  it("creates a durable queued operation with the delete input", async () => {
    const created = await repo.createOrGetActive({
      organizationId: "org_1",
      actorUserId: "user_1",
      kind: "project_delete",
      resourceType: "project",
      resourceId: "proj_1",
      input: { force: true, wipeVolumes: false },
    });

    expect(created.created).toBe(true);
    expect(created.operation.id).toMatch(/^op_/);
    expect(created.operation.status).toBe("queued");
    expect(created.operation.input).toEqual({ force: true, wipeVolumes: false });
  });

  it("reuses the active operation for repeated deletes", async () => {
    const first = await repo.createOrGetActive({
      organizationId: "org_1",
      kind: "project_delete",
      resourceType: "project",
      resourceId: "proj_1",
    });
    const repeated = await repo.createOrGetActive({
      organizationId: "org_1",
      kind: "project_delete",
      resourceType: "project",
      resourceId: "proj_1",
      input: { force: true },
    });

    expect(repeated.created).toBe(false);
    expect(repeated.operation.id).toBe(first.operation.id);
    // A replay does not mutate the original, already-authorized task input.
    expect(repeated.operation.input).toEqual({});
  });

  it("allows only one worker to claim a queued operation", async () => {
    const { operation } = await repo.createOrGetActive({
      organizationId: "org_1",
      kind: "project_delete",
      resourceType: "project",
      resourceId: "proj_1",
    });

    const [first, second] = await Promise.all([
      repo.claim(operation.id),
      repo.claim(operation.id),
    ]);
    const claimed = [first, second].filter(Boolean);

    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.status).toBe("running");
    expect(claimed[0]?.attemptCount).toBe(1);
  });

  it("persists progress and releases the active uniqueness slot on completion", async () => {
    const first = await repo.createOrGetActive({
      organizationId: "org_1",
      kind: "project_delete",
      resourceType: "project",
      resourceId: "proj_1",
    });
    await repo.claim(first.operation.id);
    await repo.transition(first.operation.id, "running", {
      currentStep: "destroying_runtime",
      progressCurrent: 2,
      progressTotal: 5,
    });
    const completed = await repo.transition(first.operation.id, "completed", {
      currentStep: "done",
      progressCurrent: 5,
      progressTotal: 5,
      result: { rowDeleted: true },
    });

    expect(completed?.finishedAt).toBeInstanceOf(Date);
    expect(completed?.result).toEqual({ rowDeleted: true });

    const next = await repo.createOrGetActive({
      organizationId: "org_1",
      kind: "project_delete",
      resourceType: "project",
      resourceId: "proj_1",
    });
    expect(next.created).toBe(true);
    expect(next.operation.id).not.toBe(first.operation.id);
  });

  it("keeps needs_action active and requeues the same operation", async () => {
    const { operation } = await repo.createOrGetActive({
      organizationId: "org_1",
      kind: "project_delete",
      resourceType: "project",
      resourceId: "proj_1",
    });
    await repo.claim(operation.id);
    await repo.transition(operation.id, "needs_action", {
      currentStep: "destroying_runtime",
      errorCode: "RUNTIME_CLEANUP_FAILED",
      errorMessage: "container would not stop",
    });

    const repeated = await repo.createOrGetActive({
      organizationId: "org_1",
      kind: "project_delete",
      resourceType: "project",
      resourceId: "proj_1",
    });
    expect(repeated.created).toBe(false);
    expect(repeated.operation.id).toBe(operation.id);

    const queued = await repo.requeue(operation.id);
    expect(queued?.status).toBe("queued");
    expect(queued?.finishedAt).toBeNull();
  });

  it("requeues a needs-action operation with newly authorized input", async () => {
    const { operation } = await repo.createOrGetActive({
      organizationId: "org_1",
      kind: "project_delete",
      resourceType: "project",
      resourceId: "proj_force",
      input: { forceOrphan: false },
    });
    await repo.claim(operation.id);
    await repo.transition(operation.id, "needs_action", {
      errorCode: "PROJECT_TEARDOWN_FAILED",
    });

    const retried = await repo.requeueWithInput(operation.id, {
      force: true,
      forceOrphan: true,
      wipeVolumes: false,
    });

    expect(retried?.id).toBe(operation.id);
    expect(retried?.status).toBe("queued");
    expect(retried?.input).toEqual({
      force: true,
      forceOrphan: true,
      wipeVolumes: false,
    });
    expect(retried?.errorCode).toBeNull();
  });

  it("recovers only stale running operations", async () => {
    const stale = await repo.createOrGetActive({
      organizationId: "org_1",
      kind: "project_delete",
      resourceType: "project",
      resourceId: "proj_stale",
    });
    const live = await repo.createOrGetActive({
      organizationId: "org_1",
      kind: "project_delete",
      resourceType: "project",
      resourceId: "proj_live",
    });
    await repo.claim(stale.operation.id);
    await repo.claim(live.operation.id);

    const recovered = await repo.requeueStaleRunning(new Date(Date.now() + 1000));
    expect(recovered.map((row) => row.id).sort()).toEqual(
      [stale.operation.id, live.operation.id].sort(),
    );

    const queued = await repo.listQueued();
    expect(queued).toHaveLength(2);
  });

  it("lists only active operations for the requested org, kind, and resources", async () => {
    const included = await repo.createOrGetActive({
      organizationId: "org_1",
      kind: "deployment_delete",
      resourceType: "deployment",
      resourceId: "dep_included",
    });
    const needsAction = await repo.createOrGetActive({
      organizationId: "org_1",
      kind: "deployment_delete",
      resourceType: "deployment",
      resourceId: "dep_retryable",
    });
    await repo.claim(needsAction.operation.id);
    await repo.transition(needsAction.operation.id, "needs_action");

    await repo.createOrGetActive({
      organizationId: "org_2",
      kind: "deployment_delete",
      resourceType: "deployment",
      resourceId: "dep_included",
    });
    await repo.createOrGetActive({
      organizationId: "org_1",
      kind: "project_delete",
      resourceType: "project",
      resourceId: "dep_included",
    });
    await repo.createOrGetActive({
      organizationId: "org_1",
      kind: "deployment_delete",
      resourceType: "deployment",
      resourceId: "dep_not_requested",
    });
    const completed = await repo.createOrGetActive({
      organizationId: "org_1",
      kind: "deployment_delete",
      resourceType: "deployment",
      resourceId: "dep_completed",
    });
    await repo.transition(completed.operation.id, "completed");

    const rows = await repo.listActiveForResources(
      "org_1",
      "deployment_delete",
      ["dep_included", "dep_retryable", "dep_completed"],
    );

    expect(rows.map((row) => row.id).sort()).toEqual(
      [included.operation.id, needsAction.operation.id].sort(),
    );
  });
});
