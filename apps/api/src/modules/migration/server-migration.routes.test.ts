import { describe, expect, it } from "vitest";
import { serverMigrationRoutes } from "./server-migration.routes";

describe("serverMigrationRoutes", () => {
  it("exposes both Docker scan transports for user-owned servers", () => {
    expect(
      serverMigrationRoutes.routes.some(
        (route) => route.method === "POST" && route.path === "/scan",
      ),
    ).toBe(true);
    expect(
      serverMigrationRoutes.routes.some(
        (route) => route.method === "GET" && route.path === "/scan/stream",
      ),
    ).toBe(true);
  });

  it("does not expose mutating migration endpoints", () => {
    const paths = serverMigrationRoutes.routes.map((route) => route.path);
    expect(paths).not.toContain("/migrate");
    expect(paths).not.toContain("/adopt");
    expect(paths).not.toContain("/migrations/:id/cutover");
  });
});
