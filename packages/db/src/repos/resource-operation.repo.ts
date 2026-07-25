import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { generateId } from "@repo/core";
import type { Database } from "../client";
import { resourceOperation } from "../schema/resource-operation";

export type ResourceOperation = typeof resourceOperation.$inferSelect;
export type NewResourceOperation = typeof resourceOperation.$inferInsert;

export type ResourceOperationKind = "project_delete" | "deployment_delete";
export type ResourceOperationType = "project" | "deployment";
export type ResourceOperationStatus =
  | "queued"
  | "running"
  | "completed"
  | "completed_with_warnings"
  | "failed"
  | "needs_action";

export const ACTIVE_RESOURCE_OPERATION_STATUSES: ResourceOperationStatus[] = [
  "queued",
  "running",
  "needs_action",
];

export const TERMINAL_RESOURCE_OPERATION_STATUSES: ResourceOperationStatus[] = [
  "completed",
  "completed_with_warnings",
  "failed",
];

const MAX_ERROR_MESSAGE = 4096;

type CreateOperationInput = {
  organizationId: string;
  actorUserId?: string | null;
  kind: ResourceOperationKind;
  resourceType: ResourceOperationType;
  resourceId: string;
  input?: Record<string, unknown>;
};

type TransitionPatch = {
  currentStep?: string | null;
  progressCurrent?: number;
  progressTotal?: number;
  result?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export function createResourceOperationRepo(db: Database) {
  const findActive = async (
    organizationId: string,
    kind: ResourceOperationKind,
    resourceId: string,
  ): Promise<ResourceOperation | undefined> =>
    db.query.resourceOperation.findFirst({
      where: and(
        eq(resourceOperation.organizationId, organizationId),
        eq(resourceOperation.kind, kind),
        eq(resourceOperation.resourceId, resourceId),
        inArray(resourceOperation.status, ACTIVE_RESOURCE_OPERATION_STATUSES),
        isNull(resourceOperation.finishedAt),
      ),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });

  return {
    /**
     * Atomically create the active operation or return the one that already
     * owns this resource. The partial unique index closes concurrent races.
     */
    async createOrGetActive(
      data: CreateOperationInput,
    ): Promise<{ operation: ResourceOperation; created: boolean }> {
      const id = generateId("op");
      const inserted = await db
        .insert(resourceOperation)
        .values({
          id,
          organizationId: data.organizationId,
          actorUserId: data.actorUserId ?? null,
          kind: data.kind,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          status: "queued",
          input: data.input ?? {},
        })
        .onConflictDoNothing()
        .returning();

      if (inserted[0]) return { operation: inserted[0], created: true };

      const existing = await findActive(data.organizationId, data.kind, data.resourceId);
      if (!existing) {
        throw new Error("Active resource operation conflicted but could not be loaded");
      }
      return { operation: existing, created: false };
    },

    async findById(id: string): Promise<ResourceOperation | undefined> {
      return db.query.resourceOperation.findFirst({
        where: eq(resourceOperation.id, id),
      });
    },

    async findByIdForOrganization(
      id: string,
      organizationId: string,
    ): Promise<ResourceOperation | undefined> {
      return db.query.resourceOperation.findFirst({
        where: and(
          eq(resourceOperation.id, id),
          eq(resourceOperation.organizationId, organizationId),
        ),
      });
    },

    findActive,

    async listQueued(limit = 50): Promise<ResourceOperation[]> {
      return db
        .select()
        .from(resourceOperation)
        .where(eq(resourceOperation.status, "queued"))
        .orderBy(asc(resourceOperation.createdAt))
        .limit(limit);
    },

    async listActiveForResources(
      organizationId: string,
      kind: ResourceOperationKind,
      resourceIds: string[],
    ): Promise<ResourceOperation[]> {
      if (resourceIds.length === 0) return [];
      return db.query.resourceOperation.findMany({
        where: and(
          eq(resourceOperation.organizationId, organizationId),
          eq(resourceOperation.kind, kind),
          inArray(resourceOperation.resourceId, resourceIds),
          inArray(resourceOperation.status, ACTIVE_RESOURCE_OPERATION_STATUSES),
          isNull(resourceOperation.finishedAt),
        ),
      });
    },

    /** Claim exactly once across competing workers. */
    async claim(id: string): Promise<ResourceOperation | undefined> {
      const rows = await db
        .update(resourceOperation)
        .set({
          status: "running",
          startedAt: sql`coalesce(${resourceOperation.startedAt}, now())`,
          lastEventAt: new Date(),
          attemptCount: sql`${resourceOperation.attemptCount} + 1`,
          errorCode: null,
          errorMessage: null,
        })
        .where(
          and(
            eq(resourceOperation.id, id),
            eq(resourceOperation.status, "queued"),
            isNull(resourceOperation.finishedAt),
          ),
        )
        .returning();
      return rows[0];
    },

    async transition(
      id: string,
      status: ResourceOperationStatus,
      patch: TransitionPatch = {},
    ): Promise<ResourceOperation | undefined> {
      const terminal = TERMINAL_RESOURCE_OPERATION_STATUSES.includes(status);
      const rows = await db
        .update(resourceOperation)
        .set({
          status,
          lastEventAt: new Date(),
          ...(terminal ? { finishedAt: new Date() } : { finishedAt: null }),
          ...(patch.currentStep !== undefined ? { currentStep: patch.currentStep } : {}),
          ...(patch.progressCurrent !== undefined
            ? { progressCurrent: patch.progressCurrent }
            : {}),
          ...(patch.progressTotal !== undefined ? { progressTotal: patch.progressTotal } : {}),
          ...(patch.result !== undefined ? { result: patch.result } : {}),
          ...(patch.errorCode !== undefined ? { errorCode: patch.errorCode } : {}),
          ...(patch.errorMessage !== undefined
            ? {
                errorMessage:
                  patch.errorMessage === null
                    ? null
                    : patch.errorMessage.slice(0, MAX_ERROR_MESSAGE),
              }
            : {}),
        })
        .where(eq(resourceOperation.id, id))
        .returning();
      return rows[0];
    },

    async heartbeat(id: string): Promise<void> {
      await db
        .update(resourceOperation)
        .set({ lastEventAt: new Date() })
        .where(
          and(
            eq(resourceOperation.id, id),
            eq(resourceOperation.status, "running"),
            isNull(resourceOperation.finishedAt),
          ),
        );
    },

    /**
     * A live worker heartbeats running operations. Anything older than the
     * cutoff has lost its worker and is safe to put back in the durable queue.
     * The conditional update makes concurrent API replicas race-safe.
     */
    async requeueStaleRunning(cutoff: Date): Promise<ResourceOperation[]> {
      return db
        .update(resourceOperation)
        .set({
          status: "queued",
          lastEventAt: new Date(),
          errorCode: "WORKER_INTERRUPTED",
          errorMessage: "Background worker stopped before the operation completed",
        })
        .where(
          and(
            eq(resourceOperation.status, "running"),
            isNull(resourceOperation.finishedAt),
            lt(resourceOperation.lastEventAt, cutoff),
          ),
        )
        .returning();
    },

    /** Requeue a task after a worker/runtime interruption. */
    async requeue(id: string, errorMessage?: string): Promise<ResourceOperation | undefined> {
      const rows = await db
        .update(resourceOperation)
        .set({
          status: "queued",
          finishedAt: null,
          lastEventAt: new Date(),
          errorCode: errorMessage ? "WORKER_INTERRUPTED" : null,
          errorMessage: errorMessage?.slice(0, MAX_ERROR_MESSAGE) ?? null,
        })
        .where(
          and(
            eq(resourceOperation.id, id),
            inArray(resourceOperation.status, ["running", "needs_action", "failed"]),
          ),
        )
        .returning();
      return rows[0];
    },

    /** User-authorized retry (for example forceOrphan) keeps the same operation
     * id/history but replaces its execution input before returning to queued. */
    async requeueWithInput(
      id: string,
      input: Record<string, unknown>,
    ): Promise<ResourceOperation | undefined> {
      const rows = await db
        .update(resourceOperation)
        .set({
          status: "queued",
          input,
          currentStep: "queued",
          finishedAt: null,
          lastEventAt: new Date(),
          errorCode: null,
          errorMessage: null,
        })
        .where(
          and(
            eq(resourceOperation.id, id),
            eq(resourceOperation.status, "needs_action"),
            isNull(resourceOperation.finishedAt),
          ),
        )
        .returning();
      return rows[0];
    },
  };
}
