/**
 * Deploy the control plane ITSELF as a real, deploy-only app.
 *
 * The Openship self-app (project `appTemplateId === "openship"`) runs as a bare
 * host process supervised by `openship up` (launchd/systemd). To make it a
 * genuine deployment — real row + `activeDeploymentId` + routes/SSL owned by the
 * normal pipeline — without a SECOND process binding the port, we create an
 * ADOPT deployment: `meta:{deployTarget:"local", runtimeMode:"bare", adopt:true}`.
 *
 *   - `ensureAdoptDeployment` — idempotent: create (or resume/activate) the
 *     adopt deployment and drive it through the pipeline's terminal path
 *     (`createQueuedDeployment` → `runtime.deploy({adopt})` → `onSuccess`). The
 *     bare runtime's adopt branch only health-probes the port; it never starts a
 *     unit. Infra-free (constructs a bare runtime directly, so it never touches
 *     legacy edge) → cross-platform.
 *   - `registerSelfAdoptReconcile` — boot hook: backfill the adopt deployment
 *     for existing installs, sync `project.port` to the live dashboard port
 *     (drifts across restarts), self-heal the custom route/cert, refresh the
 *     public URL. Replaces the old `registerSelfEdge` hook.
 *
 * All auth/zero-auth/cookie gates stay env-driven elsewhere; nothing here feeds
 * a "public" signal into them.
 */

import { repos, db, schema, eq, type Project, type Deployment } from "@repo/db";
import { BareRuntime } from "@repo/adapters";
import { safeErrorMessage } from "@repo/core";
import { env } from "../../config/env";
import { registerStartupHook } from "./index";
import {
  createQueuedDeployment,
  type DeploymentConfigSnapshot,
} from "../../modules/deployments/build.service";
import { onSuccess } from "../../modules/deployments/deployment-lifecycle";
import type { DeploymentMeta } from "../deployment-runtime";
import { refreshSelfAppPublicUrl } from "../public-url";

const APP_SLUG = "openship";
const APP_TEMPLATE_ID = "openship";
function isAdoptDeployment(dep: Deployment | null | undefined): boolean {
  return !!dep && (dep.meta as DeploymentMeta | null)?.adopt === true;
}
/** Minimal snapshot for an adopt deployment — only the read-relevant fields
 *  matter; the placeholders are never consumed (no build; adopt skips deploy). */
function adoptSnapshot(project: Project, dashPort: number): DeploymentConfigSnapshot {
  return {
    organizationId: project.organizationId,
    repoUrl: "",
    branch: project.gitBranch ?? "main",
    framework: project.framework ?? "node",
    buildImage: "",
    runtimeImage: "",
    packageManager: "",
    installCommand: "",
    buildCommand: "",
    outputDirectory: "",
    productionPaths: [],
    rootDirectory: ".",
    port: dashPort,
    startCommand: "",
    resources: null,
    buildResources: null,
    hasServer: true,
    hasBuild: false,
    deployTarget: "local",
    runtimeMode: "bare",
    adopt: true,
  };
}

/**
 * Ensure the self-app has a real ADOPT deployment (idempotent, race-safe).
 * Returns the active adopt deployment, or null if the project doesn't exist.
 */
export async function ensureAdoptDeployment(
  projectId: string,
  dashPort: number,
): Promise<Deployment | null> {
  const project = await repos.project.findById(projectId);
  if (!project) return null;

  // Already adopted + active → done.
  if (project.activeDeploymentId) {
    const active = await repos.deployment.findById(project.activeDeploymentId);
    if (isAdoptDeployment(active)) return active!;
  }

  // Reuse a prior adopt row rather than create a duplicate: a ready-but-inactive
  // one just needs activating; an in-flight one (crash between create and
  // onSuccess) gets finished. A fresh create would 403 against the
  // one-active-per-project partial index if an in-flight row still holds it.
  let dep: Deployment | null = null;
  const latest = await repos.deployment.findLatestByProject(projectId);
  if (isAdoptDeployment(latest)) {
    if (latest!.status === "ready") {
      await repos.project.setActiveDeployment(projectId, latest!.id);
      return latest!;
    }
    dep = latest!;
  }

  if (!dep) {
    dep = await createQueuedDeployment({
      projectId,
      organizationId: project.organizationId,
      branch: project.gitBranch ?? "main",
      environment: "production",
      framework: project.framework ?? "node",
      meta: adoptSnapshot(project, dashPort),
      envVars: null,
      trigger: "adopt",
    });
  }

  const session = await repos.deployment.findBuildSessionByDeploymentId(dep.id);
  const buildSessionId = session?.id ?? dep.id;

  // Exercise the first-class adopt mode via a bare runtime constructed DIRECTLY
  // (not resolveDeploymentPlatform) so we never build the legacy edge infra
  // provider here — that mkdir's /usr/local/traefik and would fail on
  // macOS/non-root. The adopt branch only health-probes the port.
  let containerId = dep.id;
  try {
    const result = await new BareRuntime().deploy({
      deploymentId: dep.id,
      projectId,
      buildSessionId,
      environment: "production",
      port: dashPort,
      envVars: {},
      resources: { cpuCores: 1, memoryMb: 512, diskMb: 1024 },
      adopt: true,
    });
    containerId = result.containerId ?? dep.id;
  } catch (err) {
    console.warn(`[self-deploy] adopt probe failed (continuing): ${safeErrorMessage(err)}`);
  }

  await onSuccess(
    { project, dep, buildSessionId, persistLogs: () => [], provisioned: {} },
    { containerId, durationMs: 0 },
  );

  return dep;
}

/** Locate the self-app project across the cloud-linked / founding-admin org.
 *  Returns null before setup has run (no admin / no self-app yet). */
async function findSelfAppProject(): Promise<Project | null> {
  const linked = await repos.settings.listCloudLinkedOrgIds().catch(() => [] as string[]);
  for (const org of linked) {
    const p = await repos.project.findBySlugInOrg(org, APP_SLUG);
    if (p && p.appTemplateId === APP_TEMPLATE_ID) return p;
  }
  const [admin] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.autoProvisioned, false))
    .orderBy(schema.user.createdAt)
    .limit(1);
  if (admin) {
    const p = await repos.project.findBySlugInOrg(`org_${admin.id}`, APP_SLUG);
    if (p && p.appTemplateId === APP_TEMPLATE_ID) return p;
  }
  return null;
}

/**
 * Boot hook: reconcile the self-app deployment + route on every start.
 * Self-hosted only (register.ts modes). NOT gated on OPENSHIP_PUBLIC_URL so
 * free/byo boxes reconcile too. First boot (no self-app) is a clean no-op.
 */
export function registerSelfAdoptReconcile(): void {
  registerStartupHook({
    id: "self-app:reconcile",
    modes: ["desktop", "selfhosted"],
    run: async () => {
      const project = await findSelfAppProject();
      if (!project) return;

      const dashPort = env.OPENSHIP_DASHBOARD_PORT || 3001;

      // (a) Backfill / ensure the adopt deployment (existing installs predate it).
      await ensureAdoptDeployment(project.id, dashPort).catch((err) =>
        console.warn(`[self-deploy] ensureAdoptDeployment failed: ${safeErrorMessage(err)}`),
      );

      // (b) Sync project.port to the live dashboard port (it can change across
      //     restarts). reapply targets domain.targetPort ?? project.port.
      if (project.port !== dashPort) {
        await repos.project
          .update(project.id, { port: dashPort })
          .catch((err) => console.warn(`[self-deploy] port sync failed: ${safeErrorMessage(err)}`));
      }

      // (c) Warm the public-URL cache from the primary domain.
      await refreshSelfAppPublicUrl().catch(() => {});
    },
  });
}
