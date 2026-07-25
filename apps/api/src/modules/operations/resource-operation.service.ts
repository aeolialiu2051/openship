import {
  repos,
  type Deployment,
  type Project,
  type ResourceOperation,
} from "@repo/db";
import { safeErrorMessage } from "@repo/core";
import type { RequestContext } from "../../lib/request-context";
import { buildBackgroundContext } from "../../lib/request-context";
import { getJobRunner, type JobRunner } from "../../lib/job-runner";
import { audit } from "../../lib/audit";
import * as projectTeardown from "../projects/project-teardown";
import * as deploymentService from "../deployments/deployment.service";

const HEARTBEAT_INTERVAL_MS = 30_000;

export interface ProjectDeleteOperationInput {
  force: boolean;
  forceOrphan: boolean;
  wipeVolumes: boolean;
}

type OperationRepo = typeof repos.resourceOperation;
type ProjectRepo = typeof repos.project;
type DeploymentRepo = typeof repos.deployment;

interface ResourceOperationDependencies {
  operationRepo: OperationRepo;
  projectRepo: ProjectRepo;
  deploymentRepo: DeploymentRepo;
  getRunner: () => Promise<JobRunner>;
  teardownProject: typeof projectTeardown.teardownProject;
  deleteDeployment: typeof deploymentService.deleteDeployment;
  recordAudit: typeof audit.record;
}

const defaultDependencies: ResourceOperationDependencies = {
  operationRepo: repos.resourceOperation,
  projectRepo: repos.project,
  deploymentRepo: repos.deployment,
  getRunner: getJobRunner,
  teardownProject: projectTeardown.teardownProject,
  deleteDeployment: deploymentService.deleteDeployment,
  recordAudit: audit.record.bind(audit),
};

export class ResourceOperationService {
  constructor(private readonly deps: ResourceOperationDependencies = defaultDependencies) {}

  /**
   * Persist first, mark the project tombstone second, then enqueue. If queue
   * delivery fails the row remains queued and the DB-backed poller recovers it.
   */
  async enqueueProjectDeletion(
    ctx: RequestContext,
    project: Project,
    input: ProjectDeleteOperationInput,
  ): Promise<{
    operation: ResourceOperation;
    created: boolean;
    accepted: boolean;
  }> {
    const created = await this.deps.operationRepo.createOrGetActive({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      kind: "project_delete",
      resourceType: "project",
      resourceId: project.id,
      input: { ...input },
    });

    if (!created.created) {
      if (created.operation.status !== "needs_action") {
        return { ...created, accepted: true };
      }

      const claimed = await this.deps.projectRepo.claimDeletion(project.id);
      if (!claimed) {
        return { ...created, accepted: false };
      }
      const requeued = await this.deps.operationRepo.requeueWithInput(
        created.operation.id,
        { ...input },
      );
      if (!requeued) {
        await this.deps.projectRepo.clearDeletionInProgress(project.id).catch(() => {});
        return { ...created, accepted: false };
      }
      try {
        const runner = await this.deps.getRunner();
        await runner.enqueueResourceOperation(requeued.id);
      } catch (err) {
        console.warn(
          `[resource-operation] retry enqueue ${requeued.id} deferred to poller: ${safeErrorMessage(err)}`,
        );
      }
      return { operation: requeued, created: false, accepted: true };
    }

    const claimed = await this.deps.projectRepo.claimDeletion(project.id);
    if (!claimed) {
      const failed = await this.deps.operationRepo.transition(
        created.operation.id,
        "failed",
        {
          currentStep: "claiming_resource",
          errorCode: "PROJECT_DELETION_IN_PROGRESS",
          errorMessage: "Project deletion is already in progress",
        },
      );
      return {
        operation: failed ?? created.operation,
        created: true,
        accepted: false,
      };
    }

    try {
      const runner = await this.deps.getRunner();
      await runner.enqueueResourceOperation(created.operation.id);
    } catch (err) {
      // Durable row is the queue of record. The in-process/BullMQ startup poll
      // will pick it up; returning 202 is still truthful.
      console.warn(
        `[resource-operation] enqueue ${created.operation.id} deferred to poller: ${safeErrorMessage(err)}`,
      );
    }

    void this.deps.recordAudit(
      {
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        ipAddress: ctx.clientIp,
        userAgent: ctx.userAgent,
      },
      {
        eventType: "project.deletion.queued",
        resourceType: "project",
        resourceId: project.id,
        after: { operationId: created.operation.id, ...input },
      },
    );

    return { ...created, accepted: true };
  }

  async enqueueDeploymentDeletion(
    ctx: RequestContext,
    deployment: Deployment,
  ): Promise<{ operation: ResourceOperation; created: boolean }> {
    const created = await this.deps.operationRepo.createOrGetActive({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      kind: "deployment_delete",
      resourceType: "deployment",
      resourceId: deployment.id,
      input: {},
    });

    let operation = created.operation;
    if (!created.created && operation.status === "needs_action") {
      operation =
        (await this.deps.operationRepo.requeueWithInput(operation.id, {})) ?? operation;
    } else if (!created.created) {
      return created;
    }

    try {
      const runner = await this.deps.getRunner();
      await runner.enqueueResourceOperation(operation.id);
    } catch (err) {
      console.warn(
        `[resource-operation] deployment enqueue ${operation.id} deferred to poller: ${safeErrorMessage(err)}`,
      );
    }

    void this.deps.recordAudit(
      {
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        ipAddress: ctx.clientIp,
        userAgent: ctx.userAgent,
      },
      {
        eventType: "deployment.deletion.queued",
        resourceType: "deployment",
        resourceId: deployment.id,
        after: { operationId: operation.id },
      },
    );

    return { operation, created: created.created };
  }

  async process(operationId: string): Promise<void> {
    const existing = await this.deps.operationRepo.findById(operationId);
    if (!existing || existing.status !== "queued") return;

    const operation = await this.deps.operationRepo.claim(operationId);
    if (!operation) return;

    const heartbeat = setInterval(() => {
      void this.deps.operationRepo.heartbeat(operation.id).catch((err) =>
        console.warn(
          `[resource-operation] heartbeat ${operation.id} failed: ${safeErrorMessage(err)}`,
        ),
      );
    }, HEARTBEAT_INTERVAL_MS);
    heartbeat.unref();

    try {
      switch (operation.kind) {
        case "project_delete":
          await this.processProjectDeletion(operation);
          return;
        case "deployment_delete":
          await this.processDeploymentDeletion(operation);
          return;
        default:
          await this.deps.operationRepo.transition(operation.id, "failed", {
            currentStep: "dispatching",
            errorCode: "UNSUPPORTED_OPERATION",
            errorMessage: `Unsupported resource operation kind: ${operation.kind}`,
          });
      }
    } catch (err) {
      if (operation.kind === "project_delete") {
        await this.deps.projectRepo
          .clearDeletionInProgress(operation.resourceId)
          .catch(() => {});
      }
      await this.deps.operationRepo.transition(operation.id, "failed", {
        currentStep: "failed",
        errorCode: "OPERATION_CRASHED",
        errorMessage: safeErrorMessage(err),
      });
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async processProjectDeletion(operation: ResourceOperation): Promise<void> {
    const project = await this.deps.projectRepo.findById(operation.resourceId);
    if (!project) {
      await this.deps.operationRepo.transition(operation.id, "completed", {
        currentStep: "done",
        progressCurrent: 1,
        progressTotal: 1,
        result: { rowDeleted: true, alreadyDeleted: true },
      });
      return;
    }

    if (project.organizationId !== operation.organizationId) {
      await this.deps.operationRepo.transition(operation.id, "failed", {
        currentStep: "validating_resource",
        errorCode: "PROJECT_ORG_MISMATCH",
        errorMessage: "Project does not belong to the operation organization",
      });
      return;
    }

    // Handles a crash between operation INSERT and the request-side tombstone.
    if (!project.deletionInProgress) {
      const claimed = await this.deps.projectRepo.claimDeletion(project.id);
      if (!claimed) {
        await this.deps.operationRepo.transition(operation.id, "needs_action", {
          currentStep: "claiming_resource",
          errorCode: "PROJECT_DELETION_IN_PROGRESS",
          errorMessage: "Project deletion lock is held by another operation",
        });
        return;
      }
    }

    await this.deps.operationRepo.transition(operation.id, "running", {
      currentStep: "tearing_down",
      progressCurrent: 1,
      progressTotal: 5,
    });

    const input = operation.input as Partial<ProjectDeleteOperationInput>;
    const backgroundCtx = buildBackgroundContext({
      userId: operation.actorUserId ?? "system",
      organizationId: operation.organizationId,
      traceId: `operation:${operation.id}`,
      label: `project-delete:${operation.id}`,
    });
    const result = await this.deps.teardownProject(
      backgroundCtx,
      project.id,
      {
        force: input.force === true,
        forceOrphan: input.forceOrphan === true,
        wipeVolumes: input.wipeVolumes === true,
        deletionLockClaimed: true,
      },
    );

    const serializedResult = {
      rowDeleted: result.rowDeleted,
      steps: result.steps,
      unrecoverable: result.unrecoverable,
      orphaned: result.orphaned,
      rejection: result.rejection ?? null,
    } as unknown as Record<string, unknown>;

    if (!result.rowDeleted) {
      await this.deps.operationRepo.transition(operation.id, "needs_action", {
        currentStep: "cleanup_blocked",
        progressCurrent: 4,
        progressTotal: 5,
        result: serializedResult,
        errorCode:
          result.rejection === "claim_lock_held"
            ? "PROJECT_DELETION_IN_PROGRESS"
            : "PROJECT_TEARDOWN_FAILED",
        errorMessage:
          result.unrecoverable[0]?.error ?? "Project teardown could not complete",
      });
      return;
    }

    const status =
      result.unrecoverable.length > 0 || result.orphaned.length > 0
        ? "completed_with_warnings"
        : "completed";
    await this.deps.operationRepo.transition(operation.id, status, {
      currentStep: "done",
      progressCurrent: 5,
      progressTotal: 5,
      result: serializedResult,
    });

    await this.deps.recordAudit(
      {
        organizationId: operation.organizationId,
        actorUserId: operation.actorUserId,
      },
      {
        eventType: "project.deleted",
        resourceType: "project",
        resourceId: project.id,
        after: { operationId: operation.id, ...serializedResult },
      },
    );
  }

  private async processDeploymentDeletion(operation: ResourceOperation): Promise<void> {
    const deployment = await this.deps.deploymentRepo.findById(operation.resourceId);
    if (!deployment) {
      await this.deps.operationRepo.transition(operation.id, "completed", {
        currentStep: "done",
        progressCurrent: 1,
        progressTotal: 1,
        result: { rowDeleted: true, alreadyDeleted: true },
      });
      return;
    }
    if (deployment.organizationId !== operation.organizationId) {
      await this.deps.operationRepo.transition(operation.id, "failed", {
        currentStep: "validating_resource",
        errorCode: "DEPLOYMENT_ORG_MISMATCH",
        errorMessage: "Deployment does not belong to the operation organization",
      });
      return;
    }

    await this.deps.operationRepo.transition(operation.id, "running", {
      currentStep: "destroying_runtime",
      progressCurrent: 1,
      progressTotal: 3,
    });
    try {
      const result = await this.deps.deleteDeployment(
        deployment.id,
        operation.organizationId,
      );
      await this.deps.operationRepo.transition(operation.id, "completed", {
        currentStep: "done",
        progressCurrent: 3,
        progressTotal: 3,
        result: {
          rowDeleted: true,
          cleanup: result.cleanup,
        } as unknown as Record<string, unknown>,
      });
      await this.deps.recordAudit(
        {
          organizationId: operation.organizationId,
          actorUserId: operation.actorUserId,
        },
        {
          eventType: "deployment.deleted",
          resourceType: "deployment",
          resourceId: deployment.id,
          after: { operationId: operation.id, cleanup: result.cleanup },
        },
      );
    } catch (err) {
      const cleanup =
        err instanceof deploymentService.DeploymentCleanupError
          ? err.cleanup
          : undefined;
      await this.deps.operationRepo.transition(operation.id, "needs_action", {
        currentStep: "cleanup_blocked",
        progressCurrent: 2,
        progressTotal: 3,
        result: cleanup
          ? ({ cleanup } as unknown as Record<string, unknown>)
          : null,
        errorCode: "DEPLOYMENT_TEARDOWN_FAILED",
        errorMessage: safeErrorMessage(err),
      });
    }
  }
}

export const resourceOperationService = new ResourceOperationService();
