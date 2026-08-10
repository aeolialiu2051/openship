import { describe, expect, it, vi } from "vitest";
import { resumeModeratedWorkload } from "./admin.service";

describe("admin project moderation runtime", () => {
  it("allows restoration and redeployment when an old container is missing", async () => {
    const removeSuspendedRoutes = vi.fn(async () => {});
    const warnings = await resumeModeratedWorkload({
      containerIds: ["existing-container", "deleted-container"],
      start: vi.fn(async (id) => {
        if (id === "deleted-container") throw new Error("No such container");
      }),
      stop: vi.fn(async () => {}),
      removeSuspendedRoutes,
    });

    expect(removeSuspendedRoutes).toHaveBeenCalledOnce();
    expect(warnings).toEqual(["could not start deleted-cont: No such container"]);
  });

  it("rolls back starts and keeps moderation active when the suspension route cannot be removed", async () => {
    const stop = vi.fn(async () => {});
    await expect(
      resumeModeratedWorkload({
        containerIds: ["container-a", "container-b"],
        start: vi.fn(async () => {}),
        stop,
        removeSuspendedRoutes: vi.fn(async () => {
          throw new Error("route carrier unavailable");
        }),
      }),
    ).rejects.toThrow("route carrier unavailable");
    expect(stop).toHaveBeenCalledTimes(2);
  });
});
