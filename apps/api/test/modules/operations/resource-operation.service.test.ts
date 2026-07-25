import { describe, expect, it, vi } from "vitest";
import type { Deployment, Project, ResourceOperation } from "@repo/db";
import { buildBackgroundContext } from "../../../src/lib/request-context";
import { ResourceOperationService } from "../../../src/modules/operations/resource-operation.service";

function operation(
  patch: Partial<ResourceOperation> = {},
): ResourceOperation {
  return {
    id: "op_1",
    organizationId: "org_1",
    actorUserId: "user_1",
    kind: "project_delete",
    resourceType: "project",
    resourceId: "proj_1",
    status: "queued",
    currentStep: null,
    progressCurrent: 0,
    progressTotal: 0,
    attemptCount: 0,
    input: { force: true, forceOrphan: false, wipeVolumes: false },
    result: null,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date(),
    startedAt: null,
    finishedAt: null,
    lastEventAt: new Date(),
    ...patch,
  };
}

function project(patch: Partial<Project> = {}): Project {
  return {
    id: "proj_1",
    organizationId: "org_1",
    deletionInProgress: false,
    appTemplateId: null,
    ...patch,
  } as Project;
}

function makeService(opts?: {
  existingOperation?: ResourceOperation;
  created?: boolean;
  projectRow?: Project;
  teardownResult?: Record<string, unknown>;
  enqueueError?: Error;
  deploymentRow?: Deployment;
  deleteDeploymentError?: Error;
}) {
  const op = opts?.existingOperation ?? operation();
  const operationRepo = {
    createOrGetActive: vi.fn(async () => ({
      operation: op,
      created: opts?.created ?? true,
    })),
    transition: vi.fn(async (_id: string, status: string, patch = {}) =>
      operation({ ...op, status, ...patch } as Partial<ResourceOperation>),
    ),
    findById: vi.fn(async () => op),
    claim: vi.fn(async () => operation({ ...op, status: "running", attemptCount: 1 })),
    heartbeat: vi.fn(async () => {}),
    requeueWithInput: vi.fn(async (_id: string, input: Record<string, unknown>) =>
      operation({ ...op, status: "queued", input }),
    ),
  };
  const projectRepo = {
    claimDeletion: vi.fn(async () => true),
    clearDeletionInProgress: vi.fn(async () => {}),
    findById: vi.fn(async () => opts?.projectRow ?? project({ deletionInProgress: true })),
  };
  const deploymentRepo = {
    findById: vi.fn(async () => opts?.deploymentRow),
  };
  const enqueueResourceOperation = vi.fn(async () => {
    if (opts?.enqueueError) throw opts.enqueueError;
  });
  const teardownProject = vi.fn(async () =>
    opts?.teardownResult ?? {
      ok: true,
      rowDeleted: true,
      steps: [],
      unrecoverable: [],
      orphaned: [],
    },
  );
  const recordAudit = vi.fn(async () => {});
  const deleteDeployment = vi.fn(async () => {
    if (opts?.deleteDeploymentError) throw opts.deleteDeploymentError;
    return { cleanup: { total: 1, succeeded: 1, failed: [] } };
  });
  const service = new ResourceOperationService({
    operationRepo,
    projectRepo,
    deploymentRepo,
    getRunner: async () => ({ enqueueResourceOperation }) as never,
    teardownProject,
    deleteDeployment,
    recordAudit,
  } as never);

  return {
    service,
    operationRepo,
    projectRepo,
    enqueueResourceOperation,
    teardownProject,
    deleteDeployment,
    recordAudit,
  };
}

describe("ResourceOperationService", () => {
  it("persists, tombstones and enqueues a project deletion", async () => {
    const f = makeService();
    const ctx = buildBackgroundContext({ userId: "user_1", organizationId: "org_1" });

    const result = await f.service.enqueueProjectDeletion(ctx, project(), {
      force: true,
      forceOrphan: false,
      wipeVolumes: false,
    });

    expect(result.accepted).toBe(true);
    expect(f.projectRepo.claimDeletion).toHaveBeenCalledWith("proj_1");
    expect(f.enqueueResourceOperation).toHaveBeenCalledWith("op_1");
  });

  it("returns the existing active operation without enqueueing duplicate work", async () => {
    const f = makeService({ created: false });
    const ctx = buildBackgroundContext({ userId: "user_1", organizationId: "org_1" });

    const result = await f.service.enqueueProjectDeletion(ctx, project(), {
      force: false,
      forceOrphan: false,
      wipeVolumes: false,
    });

    expect(result.created).toBe(false);
    expect(f.projectRepo.claimDeletion).not.toHaveBeenCalled();
    expect(f.enqueueResourceOperation).not.toHaveBeenCalled();
  });

  it("requeues the same needs-action operation with force-orphan input", async () => {
    const f = makeService({
      created: false,
      existingOperation: operation({ status: "needs_action" }),
      projectRow: project({ deletionInProgress: false }),
    });
    const ctx = buildBackgroundContext({ userId: "user_1", organizationId: "org_1" });

    const result = await f.service.enqueueProjectDeletion(ctx, project(), {
      force: true,
      forceOrphan: true,
      wipeVolumes: false,
    });

    expect(result.accepted).toBe(true);
    expect(result.operation.id).toBe("op_1");
    expect(f.operationRepo.requeueWithInput).toHaveBeenCalledWith(
      "op_1",
      expect.objectContaining({ forceOrphan: true }),
    );
    expect(f.enqueueResourceOperation).toHaveBeenCalledWith("op_1");
  });

  it("keeps an operation accepted when immediate queue delivery fails", async () => {
    const f = makeService({ enqueueError: new Error("redis unavailable") });
    const ctx = buildBackgroundContext({ userId: "user_1", organizationId: "org_1" });

    const result = await f.service.enqueueProjectDeletion(ctx, project(), {
      force: false,
      forceOrphan: false,
      wipeVolumes: false,
    });

    expect(result.accepted).toBe(true);
    expect(f.operationRepo.transition).not.toHaveBeenCalledWith(
      "op_1",
      "failed",
      expect.anything(),
    );
  });

  it("executes teardown with the pre-claimed lock and completes the operation", async () => {
    const f = makeService();
    await f.service.process("op_1");

    expect(f.teardownProject).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org_1", userId: "user_1" }),
      "proj_1",
      expect.objectContaining({
        force: true,
        deletionLockClaimed: true,
      }),
    );
    expect(f.operationRepo.transition).toHaveBeenCalledWith(
      "op_1",
      "completed",
      expect.objectContaining({ currentStep: "done", progressCurrent: 5 }),
    );
  });

  it("moves cleanup failures to needs_action instead of throwing to HTTP", async () => {
    const f = makeService({
      teardownResult: {
        ok: false,
        rowDeleted: false,
        steps: [{ step: "runtime_cleanup", status: "failed", error: "docker timeout" }],
        unrecoverable: [
          { step: "runtime_cleanup", status: "failed", error: "docker timeout" },
        ],
        orphaned: [],
      },
    });

    await f.service.process("op_1");

    expect(f.operationRepo.transition).toHaveBeenCalledWith(
      "op_1",
      "needs_action",
      expect.objectContaining({
        errorCode: "PROJECT_TEARDOWN_FAILED",
        errorMessage: "docker timeout",
      }),
    );
  });

  it("runs deployment deletion in the same durable operation pipeline", async () => {
    const deployment = {
      id: "dep_1",
      organizationId: "org_1",
      projectId: "proj_1",
      status: "ready",
    } as Deployment;
    const f = makeService({
      existingOperation: operation({
        kind: "deployment_delete",
        resourceType: "deployment",
        resourceId: "dep_1",
        input: {},
      }),
      deploymentRow: deployment,
    });

    await f.service.process("op_1");

    expect(f.deleteDeployment).toHaveBeenCalledWith("dep_1", "org_1");
    expect(f.operationRepo.transition).toHaveBeenCalledWith(
      "op_1",
      "completed",
      expect.objectContaining({ currentStep: "done", progressCurrent: 3 }),
    );
  });

  it("requeues the same deployment operation after cleanup needs action", async () => {
    const deployment = {
      id: "dep_1",
      organizationId: "org_1",
      projectId: "proj_1",
      status: "ready",
    } as Deployment;
    const f = makeService({
      created: false,
      existingOperation: operation({
        kind: "deployment_delete",
        resourceType: "deployment",
        resourceId: "dep_1",
        status: "needs_action",
        input: {},
      }),
      deploymentRow: deployment,
    });
    const ctx = buildBackgroundContext({
      userId: "user_1",
      organizationId: "org_1",
    });

    const result = await f.service.enqueueDeploymentDeletion(ctx, deployment);

    expect(result.created).toBe(false);
    expect(result.operation.id).toBe("op_1");
    expect(f.operationRepo.requeueWithInput).toHaveBeenCalledWith("op_1", {});
    expect(f.enqueueResourceOperation).toHaveBeenCalledWith("op_1");
  });

  it("keeps a deployment row retryable when runtime cleanup fails", async () => {
    const deployment = {
      id: "dep_1",
      organizationId: "org_1",
      projectId: "proj_1",
      status: "ready",
    } as Deployment;
    const f = makeService({
      existingOperation: operation({
        kind: "deployment_delete",
        resourceType: "deployment",
        resourceId: "dep_1",
        input: {},
      }),
      deploymentRow: deployment,
      deleteDeploymentError: new Error("docker timeout"),
    });

    await f.service.process("op_1");

    expect(f.operationRepo.transition).toHaveBeenCalledWith(
      "op_1",
      "needs_action",
      expect.objectContaining({
        errorCode: "DEPLOYMENT_TEARDOWN_FAILED",
        errorMessage: "docker timeout",
      }),
    );
  });
});
