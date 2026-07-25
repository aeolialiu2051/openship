import "./_setup-env";
import type { Context } from "hono";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listMailServers: vi.fn(),
  listOrganizationServers: vi.fn(),
  sshWithExecutor: vi.fn(),
}));

vi.mock("@repo/db", () => ({
  repos: {
    mailServer: {
      list: mocks.listMailServers,
    },
    server: {
      listByOrganization: mocks.listOrganizationServers,
    },
  },
}));

vi.mock("../../../src/config", () => ({
  USER_SERVERS_ENABLED: true,
}));

vi.mock("../../../src/lib/request-context", () => ({
  getRequestContext: () => ({ organizationId: "org-1" }),
}));

vi.mock("../../../src/lib/ssh-manager", () => ({
  sshManager: { withExecutor: mocks.sshWithExecutor },
}));

import { listMailServers } from "../../../src/modules/mail/mail.controller";

function listContext() {
  return {
    json: vi.fn((body: unknown) => body),
  } as unknown as Context;
}

describe("listMailServers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listMailServers.mockResolvedValue([]);
    mocks.listOrganizationServers.mockResolvedValue([
      {
        id: "server-1",
        organizationId: "org-1",
        name: "Mail VPS",
        sshHost: "192.0.2.10",
        sshPort: 22,
        sshUser: "root",
      },
    ]);
  });

  test("returns an empty DB result without probing organization servers over SSH", async () => {
    await expect(listMailServers(listContext())).resolves.toEqual({ servers: [] });

    expect(mocks.listMailServers).toHaveBeenCalledOnce();
    expect(mocks.listOrganizationServers).toHaveBeenCalledWith("org-1");
    expect(mocks.sshWithExecutor).not.toHaveBeenCalled();
  });

  test("joins registered mail servers from the database without SSH", async () => {
    mocks.listMailServers.mockResolvedValue([
      {
        serverId: "server-1",
        domain: "example.com",
        installedAt: new Date("2026-07-26T00:00:00.000Z"),
      },
    ]);

    await expect(listMailServers(listContext())).resolves.toEqual({
      servers: [
        {
          id: "server-1",
          name: "Mail VPS",
          host: "192.0.2.10",
          port: 22,
          user: "root",
          domain: "example.com",
          completed: true,
          active: false,
        },
      ],
    });
    expect(mocks.sshWithExecutor).not.toHaveBeenCalled();
  });
});
