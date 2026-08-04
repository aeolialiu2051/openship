import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBackgroundContext } from "../../lib/request-context";

const mocks = vi.hoisted(() => ({
  findProject: vi.fn(),
  findLogin: vi.fn(),
  upsertLogin: vi.fn(),
  removeLogin: vi.fn(),
  listServices: vi.fn(),
}));

vi.mock("@repo/db", () => ({
  repos: {
    project: { findById: mocks.findProject },
    projectLogin: {
      findByProjectId: mocks.findLogin,
      upsert: mocks.upsertLogin,
      remove: mocks.removeLogin,
    },
    service: { listByProject: mocks.listServices },
  },
}));

vi.mock("../../lib/encryption", () => ({
  encrypt: (value: string) => `enc:${value}`,
  decrypt: (value: string) => value.replace(/^enc:/, ""),
}));

vi.mock("../../lib/controller-helpers", () => ({
  assertResourceInOrg: (resource: { organizationId?: string } | null, _name: string, orgId: string) => {
    if (!resource || resource.organizationId !== orgId) throw new Error("not found");
    return resource;
  },
}));

import { getProjectLogin, setProjectLogin } from "./project-login.service";

const ctx = buildBackgroundContext({ userId: "user_1", organizationId: "org_1" });

describe("project login credentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findProject.mockResolvedValue({
      id: "proj_1",
      organizationId: "org_1",
      isApp: false,
      appTemplateId: null,
    });
    mocks.listServices.mockResolvedValue([{ id: "svc_1", name: "web" }]);
  });

  it("generates a password server-side and atomically injects only the login env vars", async () => {
    const result = await setProjectLogin(ctx, "proj_1", {
      url: "https://example.com/admin",
      username: "admin",
      generatePassword: true,
      service: "web",
      usernameEnvKey: "ADMIN_USER",
      passwordEnvKey: "ADMIN_PASSWORD",
    });

    expect(result).toEqual({ configured: true, generatedPassword: true });
    expect(mocks.upsertLogin).toHaveBeenCalledOnce();
    const [row, env] = mocks.upsertLogin.mock.calls[0];
    expect(row).toMatchObject({
      projectId: "proj_1",
      serviceId: "svc_1",
      url: "https://example.com/admin",
      username: "admin",
      usernameEnvKey: "ADMIN_USER",
      passwordEnvKey: "ADMIN_PASSWORD",
    });
    expect(row.passwordEncrypted).toMatch(/^enc:/);
    expect(env).toEqual([
      { key: "ADMIN_USER", value: "enc:admin", isSecret: false, serviceId: "svc_1" },
      {
        key: "ADMIN_PASSWORD",
        value: row.passwordEncrypted,
        isSecret: true,
        serviceId: "svc_1",
      },
    ]);
  });

  it("returns the exact non-root homepage and decrypted human login", async () => {
    mocks.findLogin.mockResolvedValue({
      url: "https://example.com/management.html",
      username: "operator",
      passwordEncrypted: "enc:secret-password",
    });

    await expect(getProjectLogin(ctx, "proj_1")).resolves.toEqual({
      url: "https://example.com/management.html",
      username: "operator",
      password: "secret-password",
    });
  });

  it("does not create a card without a password source", async () => {
    await expect(
      setProjectLogin(ctx, "proj_1", {
        url: "https://example.com/login",
        username: "admin",
      }),
    ).rejects.toThrow("Provide password or set generatePassword=true");
  });

  it.each([
    { isApp: true, appTemplateId: "3x-ui" },
    { isApp: false, appTemplateId: "legacy-catalog-app" },
  ])("rejects login configuration for App Catalog projects", async (catalogFields) => {
    mocks.findProject.mockResolvedValue({
      id: "proj_1",
      organizationId: "org_1",
      ...catalogFields,
    });

    await expect(
      setProjectLogin(ctx, "proj_1", {
        url: "https://example.com/login",
        username: "admin",
        generatePassword: true,
      }),
    ).rejects.toThrow("Project login is only available for non-App Catalog projects");

    expect(mocks.listServices).not.toHaveBeenCalled();
    expect(mocks.upsertLogin).not.toHaveBeenCalled();
  });

  it("does not expose a stale generic login card for an App Catalog project", async () => {
    mocks.findProject.mockResolvedValue({
      id: "proj_1",
      organizationId: "org_1",
      isApp: true,
      appTemplateId: "3x-ui",
    });
    mocks.findLogin.mockResolvedValue({
      url: "https://example.com/login",
      username: "admin",
      passwordEncrypted: "enc:secret-password",
    });

    await expect(getProjectLogin(ctx, "proj_1")).resolves.toBeNull();
    expect(mocks.findLogin).not.toHaveBeenCalled();
  });
});
