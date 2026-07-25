import type { Context } from "hono";
import { repos, type ResourceOperation } from "@repo/db";
import { param } from "../../lib/controller-helpers";
import { getRequestContext } from "../../lib/request-context";

export function toOperationDto(operation: ResourceOperation) {
  return {
    id: operation.id,
    kind: operation.kind,
    resourceType: operation.resourceType,
    resourceId: operation.resourceId,
    status: operation.status,
    currentStep: operation.currentStep,
    progress: {
      current: operation.progressCurrent,
      total: operation.progressTotal,
    },
    attemptCount: operation.attemptCount,
    result: operation.result,
    error:
      operation.errorCode || operation.errorMessage
        ? {
            code: operation.errorCode,
            message: operation.errorMessage,
          }
        : null,
    createdAt: operation.createdAt.toISOString(),
    startedAt: operation.startedAt?.toISOString() ?? null,
    finishedAt: operation.finishedAt?.toISOString() ?? null,
    updatedAt: operation.lastEventAt.toISOString(),
  };
}

export async function getById(c: Context) {
  const ctx = getRequestContext(c);
  const operation = await repos.resourceOperation.findByIdForOrganization(
    param(c, "id"),
    ctx.organizationId,
  );
  if (!operation) return c.json({ error: "Operation not found" }, 404);
  return c.json({ data: toOperationDto(operation) });
}

export async function getActive(c: Context) {
  const ctx = getRequestContext(c);
  const kind = c.req.query("kind");
  const resourceId = c.req.query("resourceId");
  if (
    (kind !== "project_delete" && kind !== "deployment_delete") ||
    !resourceId
  ) {
    return c.json(
      { error: "kind and resourceId are required", code: "INVALID_OPERATION_QUERY" },
      400,
    );
  }
  const operation = await repos.resourceOperation.findActive(
    ctx.organizationId,
    kind,
    resourceId,
  );
  if (!operation) return c.json({ error: "Active operation not found" }, 404);
  return c.json({ data: toOperationDto(operation) });
}
