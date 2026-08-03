import { describe, expect, it } from "vitest";
import { resolveComposeRuntimeEnvironment } from "../../../src/modules/deployments/compose/runtime-environment";

describe("resolveComposeRuntimeEnvironment", () => {
  it("resolves compose placeholders from project secrets", () => {
    expect(
      resolveComposeRuntimeEnvironment({
        project: { POSTGRES_PASSWORD: "project-secret" },
        deployment: {},
        compose: {
          POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}",
          DATABASE_URL: "postgres://sub2api:${POSTGRES_PASSWORD}@postgres/sub2api",
        },
        service: {},
      }),
    ).toMatchObject({
      POSTGRES_PASSWORD: "project-secret",
      DATABASE_URL: "postgres://sub2api:project-secret@postgres/sub2api",
    });
  });

  it("lets service secrets override shared and compose values", () => {
    expect(
      resolveComposeRuntimeEnvironment({
        project: { REDIS_PASSWORD: "project-secret" },
        deployment: {},
        compose: { REDIS_PASSWORD: "${REDIS_PASSWORD:-fallback}" },
        service: { REDIS_PASSWORD: "service-secret" },
      }).REDIS_PASSWORD,
    ).toBe("service-secret");
  });

  it("preserves literal compose overrides", () => {
    expect(
      resolveComposeRuntimeEnvironment({
        project: { LOG_LEVEL: "info" },
        deployment: {},
        compose: { LOG_LEVEL: "warn" },
        service: {},
      }).LOG_LEVEL,
    ).toBe("warn");
  });
});
