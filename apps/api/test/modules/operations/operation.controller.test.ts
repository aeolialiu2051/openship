import { describe, expect, it } from "vitest";
import type { ResourceOperation } from "@repo/db";
import { toOperationDto } from "../../../src/modules/operations/operation.controller";

describe("operation status DTO", () => {
  it("returns a stable polling contract without internal organization/actor fields", () => {
    const row = {
      id: "op_1",
      organizationId: "org_secret",
      actorUserId: "user_secret",
      kind: "project_delete",
      resourceType: "project",
      resourceId: "proj_1",
      status: "running",
      currentStep: "tearing_down",
      progressCurrent: 2,
      progressTotal: 5,
      attemptCount: 1,
      input: { force: true },
      result: null,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      startedAt: new Date("2026-01-01T00:00:01.000Z"),
      finishedAt: null,
      lastEventAt: new Date("2026-01-01T00:00:02.000Z"),
    } as ResourceOperation;

    const dto = toOperationDto(row);

    expect(dto).toMatchObject({
      id: "op_1",
      status: "running",
      currentStep: "tearing_down",
      progress: { current: 2, total: 5 },
      error: null,
      startedAt: "2026-01-01T00:00:01.000Z",
    });
    expect(dto).not.toHaveProperty("organizationId");
    expect(dto).not.toHaveProperty("actorUserId");
    expect(dto).not.toHaveProperty("input");
  });

  it("normalizes structured failure details", () => {
    const dto = toOperationDto({
      id: "op_2",
      organizationId: "org_1",
      actorUserId: null,
      kind: "project_delete",
      resourceType: "project",
      resourceId: "proj_2",
      status: "needs_action",
      currentStep: "cleanup_blocked",
      progressCurrent: 4,
      progressTotal: 5,
      attemptCount: 2,
      input: {},
      result: { unrecoverable: [{ step: "runtime_cleanup" }] },
      errorCode: "PROJECT_TEARDOWN_FAILED",
      errorMessage: "docker timeout",
      createdAt: new Date(),
      startedAt: new Date(),
      finishedAt: null,
      lastEventAt: new Date(),
    } as ResourceOperation);

    expect(dto.error).toEqual({
      code: "PROJECT_TEARDOWN_FAILED",
      message: "docker timeout",
    });
    expect(dto.result).toEqual({
      unrecoverable: [{ step: "runtime_cleanup" }],
    });
  });
});
