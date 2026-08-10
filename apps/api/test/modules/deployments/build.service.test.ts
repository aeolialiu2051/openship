import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  assertGitHubRepoAccess,
  kickoffBuild,
  repos,
  resolveProjectRouteState,
  resolveProjectInfo,
  resolveServicePipelineMode,
  resolveSmartRoute,
  resolveStrategy,
  runPreflightChecks,
} = vi.hoisted(() => ({
  assertGitHubRepoAccess: vi.fn(),
  kickoffBuild: vi.fn(),
  repos: {
    project: {
      findById: vi.fn(),
      getEnvMap: vi.fn(),
    },
    deployment: {
      listByProject: vi.fn(),
      findById: vi.fn(),
      getLatestSuccessfulForBranch: vi.fn(),
      create: vi.fn(),
      createBuildSession: vi.fn(),
      supersedeReconciling: vi.fn(),
      supersedePendingDecisions: vi.fn(),
    },
    service: {
      listByProject: vi.fn(),
      reconcileFromCompose: vi.fn(),
      update: vi.fn(),
    },
  },
  resolveProjectRouteState: vi.fn(),
  resolveProjectInfo: vi.fn(),
  resolveServicePipelineMode: vi.fn(),
  resolveSmartRoute: vi.fn(),
  resolveStrategy: vi.fn(),
  runPreflightChecks: vi.fn(),
}));

vi.mock("@repo/db", () => ({
  repos,
  toComposeSpec: (service: Record<string, unknown>) => service,
}));

vi.mock("../../../src/modules/deployments/preflight", () => ({
  runPreflightChecks,
}));

vi.mock("../../../src/modules/deployments/build-pipeline", () => ({
  kickoffBuild,
  resolveServicePipelineMode,
}));

vi.mock("../../../src/modules/deployments/prepare.service", () => ({
  resolveProjectInfo,
}));

vi.mock("../../../src/modules/domains/project-route.service", () => ({
  listProjectRouteRows: vi.fn(),
  resolveProjectRouteState,
  syncProjectRouteState: vi.fn(),
}));

vi.mock("../../../src/modules/github/github-access", () => ({
  assertGitHubRepoAccess,
}));

vi.mock("../../../src/modules/github/github.service", () => ({
  getLatestCommit: vi.fn(),
  getRepository: vi.fn(),
}));

vi.mock("../../../src/modules/settings/settings.service", () => ({
  resolveStrategy,
}));

vi.mock("../../../src/modules/deployments/smart-route", () => ({
  resolveSmartRoute,
}));

import {
  backfillComposeBaselinesFromActiveDeployment,
  reconcileComposeDrift,
  shouldReconcileComposeBeforeBuild,
  triggerDeployment,
  type DeploymentConfigSnapshot,
} from "../../../src/modules/deployments/build.service";

const ctx = { userId: "user-1", organizationId: "org-1" } as any;

function baseProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "project-1",
    organizationId: "org-1",
    appTemplateId: null,
    activeDeploymentId: null,
    gitUrl: null,
    localPath: "/srv/my-stack",
    gitProvider: "local",
    gitOwner: null,
    gitRepo: null,
    gitBranch: "main",
    slug: "my-stack",
    framework: "docker-compose",
    packageManager: "npm",
    installCommand: null,
    buildCommand: null,
    outputDirectory: null,
    productionPaths: null,
    rootDirectory: null,
    startCommand: null,
    buildImage: null,
    productionMode: "host",
    port: 3000,
    hasServer: true,
    hasBuild: true,
    resources: null,
    buildResources: null,
    cloudWorkspaceId: null,
    runtimeMode: "docker",
    defaultRollbackStrategy: "git",
    ...overrides,
  };
}

const composeServices = [
  {
    id: "svc-web",
    kind: "compose",
    enabled: true,
    name: "web",
    image: undefined,
    build: ".",
    dockerfile: "Dockerfile",
    ports: ["3000:3000"],
    dependsOn: [],
    environment: {},
    volumes: [],
    exposed: true,
    exposedPort: "3000",
    domainType: "free",
  },
];

describe("build/access Compose reconciliation", () => {
  it("skips the repository scan when the wizard supplies a frozen service plan", () => {
    expect(shouldReconcileComposeBeforeBuild({ services: composeServices } as any)).toBe(false);
  });

  it("treats an explicitly empty service plan as authoritative", () => {
    expect(shouldReconcileComposeBeforeBuild({ services: [] } as any)).toBe(false);
  });

  it("keeps repository reconciliation for callers that omit services", () => {
    expect(shouldReconcileComposeBeforeBuild({} as any)).toBe(true);
  });
});

function baseSnapshot(): DeploymentConfigSnapshot {
  return {
    organizationId: "org-1",
    repoUrl: "",
    branch: "main",
    framework: "docker-compose",
    buildImage: null as unknown as string,
    runtimeImage: "docker:latest",
    packageManager: "npm",
    installCommand: null as unknown as string,
    buildCommand: null as unknown as string,
    outputDirectory: null as unknown as string,
    productionPaths: [],
    rootDirectory: "",
    port: 3000,
    startCommand: null as unknown as string,
    resources: null,
    buildResources: null,
    hasServer: true,
    hasBuild: true,
    localPath: "/srv/my-stack",
    deployTarget: "server",
    runtimeMode: "docker",
    composeServices: composeServices as any,
  };
}

describe("triggerDeployment", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    repos.project.findById.mockResolvedValue(baseProject());
    repos.project.getEnvMap.mockResolvedValue({});
    repos.service.listByProject.mockResolvedValue([]);
    repos.service.reconcileFromCompose.mockResolvedValue({ driftedNames: [] });
    repos.deployment.listByProject.mockResolvedValue({ rows: [] });
    repos.deployment.getLatestSuccessfulForBranch.mockResolvedValue(null);
    repos.deployment.create.mockResolvedValue({ id: "dep-1", projectId: "project-1" });
    repos.deployment.createBuildSession.mockResolvedValue(undefined);
    repos.deployment.supersedeReconciling.mockResolvedValue(undefined);
    repos.deployment.supersedePendingDecisions.mockResolvedValue(undefined);

    assertGitHubRepoAccess.mockResolvedValue(undefined);
    resolveProjectRouteState.mockResolvedValue({
      primaryCustomDomain: undefined,
      primaryDomainType: undefined,
      primarySlug: undefined,
      publicEndpoints: [],
    });
    resolveServicePipelineMode.mockResolvedValue({
      useServicePipeline: true,
      servicePreflightServices: composeServices,
      useSingleAppPipeline: false,
    });
    resolveStrategy.mockResolvedValue("local");
    resolveProjectInfo.mockResolvedValue({ services: composeServices });
    resolveSmartRoute.mockResolvedValue({
      forceAll: undefined,
      serviceIds: undefined,
      changedPaths: undefined,
    });
    runPreflightChecks.mockResolvedValue({ ok: true, checks: [] });
    kickoffBuild.mockResolvedValue("session-1");
  });

  it("passes compose service mode into preflight for manual services deploys", async () => {
    await triggerDeployment(ctx, {
      projectId: "project-1",
      branch: "main",
      commitSha: "abc123",
    });

    expect(resolveServicePipelineMode).toHaveBeenCalledWith(
      expect.objectContaining({ id: "project-1" }),
      expect.objectContaining({ framework: "docker-compose" }),
    );
    expect(runPreflightChecks).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        multiService: true,
        composeServices,
      }),
    );
    expect(repos.deployment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          composeServices,
          runtimeMode: "docker",
          serviceDeploymentMode: "services",
        }),
      }),
    );
  });

  it("resolves service mode before preflight for reused snapshots", async () => {
    await triggerDeployment(ctx, {
      projectId: "project-1",
      branch: "main",
      commitSha: "abc123",
      reuseSnapshot: {
        meta: baseSnapshot(),
        envVars: null,
      },
    });

    expect(resolveServicePipelineMode).toHaveBeenCalledWith(
      expect.objectContaining({ id: "project-1" }),
      expect.objectContaining({ composeServices }),
    );
    expect(runPreflightChecks).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        multiService: true,
        composeServices,
      }),
    );
  });
});

describe("Compose source reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repos.service.listByProject.mockResolvedValue([]);
    repos.service.reconcileFromCompose.mockResolvedValue({ driftedNames: [] });
    resolveProjectInfo.mockResolvedValue({ services: composeServices });
  });

  it("seeds service rows for a first Compose deploy with an empty service table", async () => {
    await reconcileComposeDrift(ctx, baseProject() as any, "main");

    expect(resolveProjectInfo).toHaveBeenCalledWith({
      source: "local",
      path: "/srv/my-stack",
    });
    expect(repos.service.reconcileFromCompose).toHaveBeenCalledWith(
      "project-1",
      composeServices,
    );
  });
});

describe("compose baseline backfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recovers a legacy row baseline from the active deployment snapshot", async () => {
    repos.deployment.findById.mockImplementation(async (id: string) =>
      id === "dep-live"
        ? {
            id,
            meta: { previousActiveDeploymentId: "dep-with-compose" },
          }
        : {
            id,
            meta: {
              composeServices: [
                {
                  kind: "compose",
                  name: "web",
                  environment: { APP_VERSION: "1" },
                },
              ],
            },
          },
    );
    repos.service.update.mockResolvedValue(undefined);

    await backfillComposeBaselinesFromActiveDeployment(
      baseProject({ activeDeploymentId: "dep-live" }) as any,
      [
        {
          id: "svc-web",
          kind: "compose",
          name: "web",
          importedSpec: null,
        },
      ] as any,
    );

    expect(repos.service.update).toHaveBeenCalledWith("svc-web", {
      importedSpec: expect.objectContaining({ environment: { APP_VERSION: "1" } }),
      driftSpec: null,
    });
    expect(repos.deployment.findById).toHaveBeenCalledWith("dep-with-compose");
  });
});
