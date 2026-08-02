import { describe, expect, it } from "vitest";

import { generateDockerfile } from "../src/runtime/docker-build-plan";
import type { BuildConfig } from "../src/types";

function baseConfig(overrides: Partial<BuildConfig> = {}): BuildConfig {
  return {
    sessionId: "s1",
    projectId: "p1",
    repoUrl: "https://github.com/acme/app.git",
    branch: "main",
    stack: "vite",
    buildImage: "node:22",
    runtimeImage: "node:22",
    packageManager: "npm",
    installCommand: "npm ci",
    buildCommand: "npm run build",
    outputDirectory: "dist",
    port: 8080,
    envVars: {},
    resources: { cpuCores: 1, memoryMb: 512, diskMb: 1024 },
    ...overrides,
  };
}

describe("generateDockerfile - static branch", () => {
  it("serves the output dir from nginx with SPA fallback on the configured port", () => {
    const df = generateDockerfile(baseConfig({ isStatic: true, rootDirectory: "frontend", port: 8080 }));
    expect(df).toContain("FROM node:22 AS builder");
    expect(df).toContain("RUN"); // install+build step
    expect(df).toContain("FROM nginx:alpine");
    expect(df).toContain("COPY --from=builder /workspace/frontend/dist /usr/share/nginx/html");
    expect(df).toContain("listen 8080 default_server;");
    expect(df).toContain("try_files $uri $uri/ /index.html;");
    expect(df).toContain("[vibrail] Static server listening on port 8080");
    expect(df).toContain("nginx -g");
  });

  it("serves from the repo root when rootDirectory is '.'", () => {
    const df = generateDockerfile(baseConfig({ isStatic: true, rootDirectory: ".", outputDirectory: "docs" }));
    expect(df).toContain("COPY --from=builder /workspace/docs /usr/share/nginx/html");
  });

  it("a non-static (server) sub-app does NOT use the static branch", () => {
    const df = generateDockerfile(baseConfig({ isStatic: false, startCommand: "node server.js" }));
    expect(df).not.toContain("nginx:alpine");
    expect(df).toContain("[vibrail] Application starting on port 8080");
    expect(df).toContain("node server.js");
  });
});
