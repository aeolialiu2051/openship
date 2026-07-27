import { describe, expect, it } from "vitest";
import { serverSystemRoutes } from "./server-system.routes";

describe("serverSystemRoutes", () => {
  it("exposes the per-server port scan in user-server mode", () => {
    expect(
      serverSystemRoutes.routes.some(
        (route) =>
          route.method === "POST" && route.path === "/servers/:id/ports/scan",
      ),
    ).toBe(true);
  });
});
