import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  permissionAssert: vi.fn(),
  getServer: vi.fn(),
  probeReachable: vi.fn(),
  withExecutor: vi.fn(),
  scanPorts: vi.fn(),
}));

vi.mock("../../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config")>();
  return { ...actual, env: { ...actual.env, CLOUD_MODE: true } };
});

vi.mock("../../lib/request-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/request-context")>();
  return {
    ...actual,
    getRequestContext: () => ({ organizationId: "org-1", userId: "user-1" }),
  };
});

vi.mock("../../lib/permission", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/permission")>();
  return { ...actual, permission: { ...actual.permission, assert: H.permissionAssert } };
});

vi.mock("@repo/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/db")>();
  return {
    ...actual,
    repos: {
      ...actual.repos,
      server: { ...actual.repos.server, getInOrganization: H.getServer },
    },
  };
});

vi.mock("../../lib/ssh-manager", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/ssh-manager")>();
  return {
    ...actual,
    sshManager: {
      ...actual.sshManager,
      probeReachable: H.probeReachable,
      withExecutor: H.withExecutor,
    },
  };
});

vi.mock("@repo/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/adapters")>();
  return { ...actual, scanPorts: H.scanPorts };
});

import { scanExposedPorts } from "./server-check.controller";

type JsonResponse = { data: unknown; status: number };

beforeEach(() => {
  vi.clearAllMocks();
  H.getServer.mockResolvedValue({ sshHost: "127.0.0.1" });
  H.probeReachable.mockResolvedValue(true);
  H.withExecutor.mockImplementation(async (_serverId, run) => run({}));
  H.scanPorts.mockResolvedValue({
    listeners: [],
    totalCount: 0,
    exposedCount: 0,
    source: "ss",
    scanned: true,
  });
});

describe("scanExposedPorts in cloud mode", () => {
  it("scans an authorized organization server instead of returning 404", async () => {
    const context = {
      req: { param: () => "server-1" },
      json: (data: unknown, status = 200): JsonResponse => ({ data, status }),
    };

    const response = (await scanExposedPorts(context as never)) as unknown as JsonResponse;

    expect(response.status).toBe(200);
    expect(H.permissionAssert).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", userId: "user-1" }),
      { resourceType: "server", resourceId: "server-1", action: "read" },
    );
    expect(H.getServer).toHaveBeenCalledWith("server-1", "org-1");
    expect(H.probeReachable).toHaveBeenCalledWith("server-1");
    expect(H.scanPorts).toHaveBeenCalledOnce();
  });
});
