import { beforeEach, describe, expect, it, vi } from "vitest";
import { GITHUB_KNOWN_HOSTS } from "../../../src/modules/github/github-known-hosts";

// Mutable capability so a single suite can exercise enabled and locked modes.
const { capability, getByServer, listByServer } = vi.hoisted(() => ({
  capability: { enabled: true },
  getByServer: vi.fn(),
  listByServer: vi.fn(),
}));

vi.mock("../../../src/config/env", () => ({
  get USER_SERVERS_ENABLED() {
    return capability.enabled;
  },
}));
vi.mock("@repo/db", () => ({
  repos: {
    serverGithubAuth: { getByServer, deleteByServer: vi.fn() },
    githubDeployKey: { listByServer, deleteByServer: vi.fn() },
  },
}));
vi.mock("../../../src/lib/encryption", () => ({
  encrypt: (s: string) => `ENC:${s}`,
  decrypt: (s: string) => s.replace(/^ENC:/, ""),
}));
// Sibling modules imported at load time — stubbed so the service loads in isolation.
vi.mock("../../../src/modules/github/github.local-auth", () => ({
  startServerDeviceFlow: vi.fn(),
  getDeviceFlowStatus: vi.fn(),
  cancelDeviceFlow: vi.fn(),
}));
vi.mock("../../../src/modules/github/github.http", () => ({ ghFetchSoft: vi.fn() }));
vi.mock("../../../src/modules/github/github.service", () => ({
  createDeployKey: vi.fn(),
  revokeDeployKey: vi.fn(),
}));

import {
  resolveServerGitCredential,
  canResolveServerGitCredential,
  disconnectServerGithub,
} from "../../../src/modules/github/server-github.service";

const ctx = { userId: "u1", organizationId: "o1" } as any;
const resolve = (owner: string | null = "acme", repo: string | null = "app") =>
  resolveServerGitCredential({ serverId: "s1", ctx, owner, repo });

beforeEach(() => {
  vi.clearAllMocks();
  capability.enabled = true;
  listByServer.mockResolvedValue([]);
});

describe("resolveServerGitCredential — capability guard", () => {
  it("returns null and never reads the DB when user servers are disabled", async () => {
    capability.enabled = false;
    expect(await resolve()).toBeNull();
    expect(getByServer).not.toHaveBeenCalled();
  });
});

describe("resolveServerGitCredential — mode mapping", () => {
  it("no config row → null (fall through to the shared chain)", async () => {
    getByServer.mockResolvedValue(null);
    expect(await resolve()).toBeNull();
  });

  it("token mode → decrypted token", async () => {
    getByServer.mockResolvedValue({ mode: "token", tokenEncrypted: "ENC:ghp_abc" });
    expect(await resolve()).toEqual({ token: "ghp_abc" });
  });

  it("token mode without stored token → null", async () => {
    getByServer.mockResolvedValue({ mode: "token", tokenEncrypted: null });
    expect(await resolve()).toBeNull();
  });

  it("ssh-server-key mode → decrypted key with the PINNED known_hosts", async () => {
    getByServer.mockResolvedValue({
      mode: "ssh-server-key",
      serverKeyPrivateEncrypted: "ENC:PRIVATE",
    });
    expect(await resolve()).toEqual({
      ssh: { keyKind: "server-key", privateKey: "PRIVATE", knownHosts: GITHUB_KNOWN_HOSTS },
    });
  });

  it("ssh-deploy-key mode without owner/repo → null (can't scope a deploy key)", async () => {
    getByServer.mockResolvedValue({ mode: "ssh-deploy-key", organizationId: "o1" });
    expect(await resolve(null, null)).toBeNull();
  });
});

describe("canResolveServerGitCredential — matches the resolver verdict", () => {
  it("false when user servers are disabled", async () => {
    capability.enabled = false;
    expect(await canResolveServerGitCredential("s1")).toBe(false);
  });
  it("false when no row", async () => {
    getByServer.mockResolvedValue(null);
    expect(await canResolveServerGitCredential("s1")).toBe(false);
  });
  it("token mode true only with stored material", async () => {
    getByServer.mockResolvedValue({ mode: "token", tokenEncrypted: "ENC:x" });
    expect(await canResolveServerGitCredential("s1")).toBe(true);
    getByServer.mockResolvedValue({ mode: "token", tokenEncrypted: null });
    expect(await canResolveServerGitCredential("s1")).toBe(false);
  });
  it("ssh-deploy-key is true without material (minted lazily at deploy)", async () => {
    getByServer.mockResolvedValue({ mode: "ssh-deploy-key" });
    expect(await canResolveServerGitCredential("s1")).toBe(true);
  });
});

describe("mutator capability guard", () => {
  it("disconnect throws when user servers are disabled before touching any DB", async () => {
    capability.enabled = false;
    await expect(disconnectServerGithub(ctx, "s1")).rejects.toThrow(/not available/i);
    expect(listByServer).not.toHaveBeenCalled();
  });
});
