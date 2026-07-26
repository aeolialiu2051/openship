import { describe, expect, it } from "vitest";
import { appServiceManagedLabel } from "../../../src/modules/apps/app-install-routing";

describe("App install managed domains", () => {
  it("adds the project's Base36 route key to a single-service app", () => {
    expect(appServiceManagedLabel({
      projectLabel: "n8n",
      serviceName: "n8n",
      routeKey: "oo198w",
    })).toBe("n8n-oo198w");
  });

  it("keeps a multi-port suffix before the immutable route key", () => {
    expect(appServiceManagedLabel({
      projectLabel: "convex",
      serviceName: "backend",
      slugSuffix: "actions",
      routeKey: "4gssqa",
    })).toBe("convex-backend-actions-4gssqa");
  });
});
