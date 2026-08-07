import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const h = vi.hoisted(() => ({ token: "tok" as string | null }));
vi.mock("../../src/lib/config", () => ({
  getApiUrl: () => "http://api.test",
  getToken: () => h.token,
}));
vi.mock("../../src/lib/caps", () => ({
  fetchCaps: async () => ({ selfHosted: false, userServers: true }),
  requireUserServers: () => {},
}));

import { serverCommand } from "../../src/commands/server";
import { setJsonMode } from "../../src/lib/output";
import { runCommand, stubFetch, type FetchStub } from "../helpers/harness";

let fetchStub: FetchStub;
let tempDir: string | undefined;
beforeEach(() => {
  h.token = "tok";
});
afterEach(() => {
  fetchStub?.restore();
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

const SERVERS = [
  { id: "srv1", name: "web", sshHost: "1.2.3.4", sshPort: 22, sshUser: "root" },
  { id: "srv2", name: null, sshHost: "5.6.7.8", sshPort: 22, sshUser: "deploy" },
];

describe("vibrail server list", () => {
  it("GETs /system/servers and tabulates them", async () => {
    fetchStub = stubFetch(() => ({ json: SERVERS }));
    const { out, code } = await runCommand(serverCommand, ["list"]);
    expect(code).toBe(0);
    expect(fetchStub.calls[0].url).toBe("http://api.test/api/system/servers");
    expect(fetchStub.calls[0].method).toBe("GET");
    expect(out).toContain("srv1");
    expect(out).toContain("1.2.3.4");
  });

  it("emits raw JSON in json mode (the root --json flag sets this)", async () => {
    setJsonMode(true);
    fetchStub = stubFetch(() => ({ json: SERVERS }));
    try {
      const { out } = await runCommand(serverCommand, ["list"]);
      expect(JSON.parse(out)).toEqual(SERVERS);
    } finally {
      setJsonMode(false);
    }
  });
});

describe("vibrail server read-only inspection", () => {
  it("GETs one server by id", async () => {
    fetchStub = stubFetch(() => ({ json: SERVERS[0] }));
    const { out, code } = await runCommand(serverCommand, ["show", "srv1"]);
    expect(code).toBe(0);
    expect(fetchStub.calls[0].url).toBe("http://api.test/api/system/servers/srv1");
    expect(out).toContain("1.2.3.4");
  });

  it("checks lightweight reachability", async () => {
    fetchStub = stubFetch(() => ({ json: { reachable: true } }));
    const { err, code } = await runCommand(serverCommand, ["reachability", "srv1"]);
    expect(code).toBe(0);
    expect(fetchStub.calls[0].url).toBe(
      "http://api.test/api/system/servers/srv1/reachability",
    );
    expect(err).toContain("reachable");
  });

  it("returns the Docker overview as JSON", async () => {
    const overview = {
      server: SERVERS[0],
      summary: { runningProjects: 1, runningContainers: 2, totalContainers: 3 },
      projects: [],
      containers: [],
      collectedAt: "2026-08-02T00:00:00.000Z",
    };
    setJsonMode(true);
    fetchStub = stubFetch(() => ({ json: overview }));
    try {
      const { out, code } = await runCommand(serverCommand, ["overview", "srv1"]);
      expect(code).toBe(0);
      expect(fetchStub.calls[0].url).toBe(
        "http://api.test/api/system/servers/srv1/docker/overview",
      );
      expect(JSON.parse(out)).toEqual(overview);
    } finally {
      setJsonMode(false);
    }
  });
});

describe("vibrail server rm", () => {
  it("DELETEs the server by id", async () => {
    fetchStub = stubFetch(() => ({ status: 204 }));
    const { err, code } = await runCommand(serverCommand, ["rm", "srv1"]);
    expect(code).toBe(0);
    expect(fetchStub.calls[0].method).toBe("DELETE");
    expect(fetchStub.calls[0].url).toBe("http://api.test/api/system/servers/srv1");
    expect(err).toContain("Removed server srv1");
  });
});

describe("vibrail server add", () => {
  it("reads --key-path locally and uploads the private key contents", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "vibrail-cli-server-"));
    const keyPath = join(tempDir, "id_ed25519");
    const privateKey = "-----BEGIN OPENSSH PRIVATE KEY-----\ntest-key\n-----END OPENSSH PRIVATE KEY-----\n";
    writeFileSync(keyPath, privateKey, { mode: 0o600 });
    fetchStub = stubFetch(() => ({ json: { ...SERVERS[0], sshAuthMethod: "key" } }));

    const { code } = await runCommand(serverCommand, [
      "add",
      "--host", "1.2.3.4",
      "--auth-method", "key",
      "--key-path", keyPath,
    ]);

    expect(code).toBe(0);
    expect(fetchStub.calls[0].body).toMatchObject({
      sshAuthMethod: "key",
      sshPrivateKey: privateKey,
    });
    expect(fetchStub.calls[0].body).not.toHaveProperty("sshKeyPath");
  });

  it("rejects an unreadable key path before making an API request", async () => {
    fetchStub = stubFetch(() => ({ json: SERVERS[0] }));

    const { code, err } = await runCommand(serverCommand, [
      "add",
      "--host", "1.2.3.4",
      "--auth-method", "key",
      "--key-path", "/definitely/missing/vibrail-key",
    ]);

    expect(code).toBe(1);
    expect(err).toContain("Unable to read SSH private key file");
    expect(fetchStub.calls).toHaveLength(0);
  });

  it("rejects a private key file larger than the API limit", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "vibrail-cli-server-"));
    const keyPath = join(tempDir, "oversized-key");
    writeFileSync(keyPath, "x".repeat(65_537), { mode: 0o600 });
    fetchStub = stubFetch(() => ({ json: SERVERS[0] }));

    const { code, err } = await runCommand(serverCommand, [
      "add",
      "--host", "1.2.3.4",
      "--auth-method", "key",
      "--key-path", keyPath,
    ]);

    expect(code).toBe(1);
    expect(err).toContain("exceeds the 65536-byte limit");
    expect(fetchStub.calls).toHaveLength(0);
  });
});

describe("vibrail server test-connection", () => {
  it("uses the same local private-key upload flow", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "vibrail-cli-server-"));
    const keyPath = join(tempDir, "id_ed25519");
    const privateKey = "-----BEGIN OPENSSH PRIVATE KEY-----\ntest-key\n-----END OPENSSH PRIVATE KEY-----\n";
    writeFileSync(keyPath, privateKey, { mode: 0o600 });
    fetchStub = stubFetch(() => ({ json: { ok: true, message: "connected" } }));

    const { code } = await runCommand(serverCommand, [
      "test-connection",
      "--host", "1.2.3.4",
      "--auth-method", "key",
      "--key-path", keyPath,
    ]);

    expect(code).toBe(0);
    expect(fetchStub.calls[0].url).toBe("http://api.test/api/system/test-connection");
    expect(fetchStub.calls[0].body).toMatchObject({ sshPrivateKey: privateKey });
    expect(fetchStub.calls[0].body).not.toHaveProperty("sshKeyPath");
  });
});

describe("guard: not logged in", () => {
  it("exits 1 with a login hint and makes no request", async () => {
    h.token = null;
    fetchStub = stubFetch(() => ({ json: [] }));
    const { err, code } = await runCommand(serverCommand, ["list"]);
    expect(code).toBe(1);
    expect(err).toContain("Not logged in");
    expect(fetchStub.calls).toHaveLength(0);
  });
});

describe("guard: API error", () => {
  it("surfaces the API {error} message and exits 1", async () => {
    fetchStub = stubFetch(() => ({ status: 500, json: { error: "db down" } }));
    const { err, code } = await runCommand(serverCommand, ["list"]);
    expect(code).toBe(1);
    expect(err).toContain("db down");
  });
});
