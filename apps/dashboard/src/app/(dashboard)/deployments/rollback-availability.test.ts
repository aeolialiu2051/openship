import { describe, expect, it } from "vitest";
import { getRollbackAvailability } from "./rollback-availability";
import { mapRowToDeployment } from "./utils";

const commit = { fullHash: "f7e3e1d1234567890" };

describe("getRollbackAvailability", () => {
  it("preserves the API rollback strategy when mapping deployment rows", () => {
    expect(
      mapRowToDeployment({
        id: "dep_git",
        status: "ready",
        rollbackStrategy: "git",
        commitSha: commit.fullHash,
        createdAt: "2026-07-29T00:00:00.000Z",
      }),
    ).toMatchObject({ status: "success", rollbackStrategy: "git" });
  });

  it("allows a successful git rollback without a retained artifact", () => {
    expect(
      getRollbackAvailability({
        status: "success",
        rollbackStrategy: "git",
        artifactRetainedAt: null,
        commit,
      }),
    ).toMatchObject({ canRollback: true, canRedeployCommit: false });
  });

  it("allows a successful snapshot rollback only while its artifact is retained", () => {
    expect(
      getRollbackAvailability({
        status: "success",
        rollbackStrategy: "snapshot",
        artifactRetainedAt: "2026-07-29T00:00:00.000Z",
        commit,
      }).canRollback,
    ).toBe(true);

    expect(
      getRollbackAvailability({
        status: "success",
        rollbackStrategy: "snapshot",
        artifactRetainedAt: null,
        commit,
      }),
    ).toMatchObject({ canRollback: false, canRedeployCommit: true });
  });

  it("accepts backend ready and partial-failure success states", () => {
    for (const status of ["ready", "partial_failure"]) {
      expect(
        getRollbackAvailability({
          status,
          rollbackStrategy: "git",
          commit,
        }).canRollback,
      ).toBe(true);
    }
  });

  it("does not allow rollback to the active or an unsuccessful deployment", () => {
    expect(
      getRollbackAvailability({
        status: "success",
        isActive: true,
        rollbackStrategy: "git",
        commit,
      }).canRollback,
    ).toBe(false);
    expect(
      getRollbackAvailability({
        status: "failed",
        rollbackStrategy: "git",
        commit,
      }).canRollback,
    ).toBe(false);
  });
});
