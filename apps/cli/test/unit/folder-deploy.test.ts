import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  apiRaw: vi.fn(),
  existingPaths: new Set<string>(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn((path: string) => h.existingPaths.has(path)),
  readFileSync: vi.fn(() => Buffer.from("archive")),
  rmSync: vi.fn(),
}));

vi.mock("../../src/lib/api-client", () => ({
  apiRequest: h.apiRequest,
  apiRaw: h.apiRaw,
}));

import { deployFolder } from "../../src/lib/folder-deploy";

beforeEach(() => {
  h.apiRequest.mockReset();
  h.apiRaw.mockReset();
  h.existingPaths.clear();
  h.apiRaw.mockResolvedValue(new Response(null, { status: 204 }));
  h.apiRequest.mockImplementation(async (path: string) => {
    if (path === "/projects/folder/session") {
      return {
        success: true,
        sessionId: "session_1",
        upload: { url: "projects/folder/upload/session_1", method: "POST", headers: {} },
      };
    }
    if (path === "/projects/folder/scan/session_1") {
      return {
        success: true,
        name: "demo",
        stack: "docker-compose",
        projectType: "services",
        services: [{ name: "web", image: "nginx:alpine", ports: ["80"] }],
      };
    }
    if (path === "/projects/ensure") return { success: true, project_id: "proj_1" };
    if (path === "/deployments/build/access") {
      return { success: true, deployment_id: "dep_1", project_id: "proj_1" };
    }
    throw new Error(`Unexpected API path: ${path}`);
  });
});

describe("deployFolder server binding", () => {
  it("hints Compose before Dockerfile and Dockerfile before language manifests", async () => {
    h.existingPaths.add("/tmp/vibrail-folder-test/docker-compose.yml");
    h.existingPaths.add("/tmp/vibrail-folder-test/Dockerfile");
    h.existingPaths.add("/tmp/vibrail-folder-test/package.json");

    await deployFolder({ cwd: "/tmp/vibrail-folder-test" });

    const composeSessionCall = h.apiRequest.mock.calls.find(
      ([path]) => path === "/projects/folder/session",
    );
    expect(JSON.parse(composeSessionCall?.[1]?.body as string)).toEqual(
      expect.objectContaining({ stack: "docker-compose" }),
    );

    h.existingPaths.delete("/tmp/vibrail-folder-test/docker-compose.yml");
    h.apiRequest.mockClear();
    await deployFolder({ cwd: "/tmp/vibrail-folder-test" });

    const dockerSessionCall = h.apiRequest.mock.calls.find(
      ([path]) => path === "/projects/folder/session",
    );
    expect(JSON.parse(dockerSessionCall?.[1]?.body as string)).toEqual(
      expect.objectContaining({ stack: "docker" }),
    );
  });

  it("binds the upload session and build request to the selected server", async () => {
    const result = await deployFolder({
      cwd: "/tmp/vibrail-folder-test",
      serverId: "srv_1",
    });

    expect(result).toEqual({ deploymentId: "dep_1", projectId: "proj_1" });

    const sessionCall = h.apiRequest.mock.calls.find(
      ([path]) => path === "/projects/folder/session",
    );
    expect(JSON.parse(sessionCall?.[1]?.body as string)).toEqual({
      name: "vibrail-folder-test",
      serverId: "srv_1",
    });

    const buildCall = h.apiRequest.mock.calls.find(
      ([path]) => path === "/deployments/build/access",
    );
    expect(JSON.parse(buildCall?.[1]?.body as string)).toEqual(
      expect.objectContaining({
        projectId: "proj_1",
        uploadSessionId: "session_1",
        deployTarget: "server",
        serverId: "srv_1",
        runtimeMode: "docker",
        replaceServices: true,
      }),
    );
  });

  it("carries an explicit public Compose service into the first build request", async () => {
    await deployFolder({
      cwd: "/tmp/vibrail-folder-test",
      publicService: "web",
      publicPort: "80",
    });

    const buildCall = h.apiRequest.mock.calls.find(
      ([path]) => path === "/deployments/build/access",
    );
    expect(JSON.parse(buildCall?.[1]?.body as string)).toEqual(
      expect.objectContaining({
        publicService: "web",
        publicPort: "80",
      }),
    );
  });
});
