import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveProjectInfo } from "../../../src/modules/deployments/prepare.service";

describe("resolveProjectInfo", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("prefers a nested compose project over a root Dockerfile", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "openship-prepare-"));
    tempDirs.push(tempDir);

    await writeFile(join(tempDir, "Dockerfile"), "FROM nginx:alpine\n");
    await mkdir(join(tempDir, "deploy"), { recursive: true });
    await writeFile(
      join(tempDir, "deploy", "compose.yml"),
      [
        "services:",
        "  web:",
        "    image: nginx:alpine",
        "    environment:",
        "      PORT: ${PORT:-8080}",
      ].join("\n"),
    );
    await writeFile(join(tempDir, "deploy", ".env"), "PORT=9090\n");

    const result = await resolveProjectInfo({ source: "local", path: tempDir });

    expect(result.rootDirectory).toBe("deploy");
    expect(result.projectType).toBe("services");
    expect(result.stack).toBe("docker-compose");
    expect(result.services?.map((service) => service.name)).toEqual(["web"]);
    expect(result.rootEnv).toEqual({ PORT: "9090" });
  });

  it("prefers a root compose file over a detected Go framework", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "openship-prepare-"));
    tempDirs.push(tempDir);

    await writeFile(
      join(tempDir, "go.mod"),
      "module example.com/root-api\n\nrequire github.com/gin-gonic/gin v1.10.0\n",
    );
    await writeFile(join(tempDir, "docker-compose.yml"), "services:\n  api:\n    build: .\n");

    const result = await resolveProjectInfo({ source: "local", path: tempDir });

    expect(result.rootDirectory).toBe("./");
    expect(result.stack).toBe("docker-compose");
    expect(result.services?.map((service) => service.name)).toEqual(["api"]);
  });

  it("falls back to Dockerfile detection when no compose file exists", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "openship-prepare-"));
    tempDirs.push(tempDir);
    await writeFile(join(tempDir, "Dockerfile"), "FROM nginx:alpine\nEXPOSE 8080\n");

    const result = await resolveProjectInfo({ source: "local", path: tempDir });

    expect(result.projectType).toBe("docker");
    expect(result.stack).toBe("docker");
    expect(result.port).toBe(8080);
  });

  it("rejects a root compose file with no services", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "openship-prepare-"));
    tempDirs.push(tempDir);
    await writeFile(join(tempDir, "docker-compose.yml"), "volumes:\n  data:\n");

    await expect(resolveProjectInfo({ source: "local", path: tempDir })).rejects.toThrow(
      "Invalid Docker Compose file: No services were declared.",
    );
  });
});
