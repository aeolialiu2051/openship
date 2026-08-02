/**
 * Reconciler for the Project row that represents "Vibrail itself,
 * being deployed to the operator's server."
 *
 * Modeled on apps/api/src/modules/mail/webmail/webmail-project.service.ts:
 * fixed config (operator can't edit), deterministic slug, reconcile on
 * every deploy so a code change ships clean.
 *
 * The deploy pipeline reads `localPath` to stream the dist to the
 * target server, runs `installCommand`, then `startCommand`. The
 * release dist is laid out so install is the only step that needs to
 * happen on the target (no build — dist is pre-built).
 */

import { repos, type Project } from "@repo/db";
import { resolveVibrailDistDir } from "./vibrail-dist";

const PROJECT_NAME = "Vibrail";
const DEFAULT_INTERNAL_PORT = 4000;

/**
 * Fixed config — every field that goes into the project row when we
 * (re)create / reconcile it. The wizard never lets the operator edit
 * these; they're stamped by the deploy pipeline.
 *
 * Layout of the shipped dist (matches the build-release.ts script to
 * be written separately):
 *
 *   release-dist/
 *     package.json        ← bundles api + dashboard runtime deps
 *     api/                ← API source (bun runs TS directly)
 *     dashboard/          ← pre-built Next standalone output
 *     start.ts            ← orchestrator: boots api + serves dashboard
 *
 * installCommand: `bun install --production --frozen-lockfile` —
 *                 frozen-lockfile fails if the dist's lock drifts from
 *                 its package.json (caught a real bug in webmail when
 *                 0.3.4 silently resolved to 0.4.2 on the target).
 * buildCommand:   empty — dist is pre-built, target does no build work.
 * startCommand:   bun runs the release orchestrator that boots api +
 *                 dashboard as a single process under one supervisor.
 */
const VIBRAIL_CONFIG = {
  framework: "vibrail",
  packageManager: "bun",
  installCommand: "bun install --production --frozen-lockfile",
  buildCommand: "",
  outputDirectory: "",
  startCommand: "bun run start.ts",
  productionMode: "host" as const,
  port: DEFAULT_INTERNAL_PORT,
  hasServer: true,
  // hasBuild=true lets `installCommand` through; `buildCommand=""` is
  // honored downstream and the build step is cleanly skipped (same
  // pattern webmail uses).
  hasBuild: true,
  buildImage: "oven/bun:latest",
} as const;

/**
 * Project slug — deterministic per source instance so re-running the
 * wizard against the same target finds the existing row instead of
 * creating duplicates. We key off `instance-${organizationId}` because
 * the wizard always migrates the org's data; the org id is the stable
 * identity of the migration.
 */
function vibrailDeploySlug(organizationId: string): string {
  return `vibrail-instance-${organizationId}`;
}

export interface EnsureVibrailProjectResult {
  projectId: string;
  groupId: string;
  project: Project;
  releaseDistPath: string;
}

/**
 * Reconcile the Project + ProjectGroup rows that represent "vibrail
 * being deployed to operator's server". Idempotent — re-running with
 * the same org returns the same row (and updates if the fixed config
 * drifted since last run).
 *
 * Throws `VibrailReleaseDistMissingError` (from vibrail-dist.ts) if
 * the release dist hasn't been built yet — the wizard's preflight
 * step catches this and surfaces a "build the release first" hint.
 */
export async function ensureVibrailProject(
  organizationId: string,
): Promise<EnsureVibrailProjectResult> {
  const releaseDistPath = await resolveVibrailDistDir();
  const slug = vibrailDeploySlug(organizationId);

  // ProjectGroup + Project rows scoped to the migrating org. Mirror the
  // webmail pattern: find-by-slug globally, then assert org match; if
  // it's in a different org treat as not-found and create fresh.
  let app = await repos.projectGroup.findFirstBySlug(slug);
  if (app && app.organizationId !== organizationId) {
    app = undefined;
  }
  if (!app) {
    app = await repos.projectGroup.create({
      organizationId,
      name: PROJECT_NAME,
      slug,
    });
  }

  let project = await repos.project.findFirstBySlug(slug);
  if (project && project.organizationId !== organizationId) {
    project = undefined;
  }

  const fixedConfig = { ...VIBRAIL_CONFIG, localPath: releaseDistPath };

  if (!project) {
    project = await repos.project.create({
      organizationId,
      groupId: app.id,
      name: PROJECT_NAME,
      slug,
      environmentName: "Production",
      environmentSlug: "production",
      environmentType: "production",
      ...fixedConfig,
    });
  } else {
    // Reconcile every deploy — the fixed config isn't user-editable,
    // so any divergence means we shipped a code change since this row
    // was created. Pin the row back to the canonical values so the
    // next deploy uses the current contract.
    const diverged = (Object.keys(fixedConfig) as Array<keyof typeof fixedConfig>).some(
      (k) => (project as Record<string, unknown>)[k] !== fixedConfig[k],
    );
    if (diverged) {
      await repos.project.update(project.id, fixedConfig);
      project = { ...project, ...fixedConfig };
    }
  }

  return {
    projectId: project.id,
    groupId: app.id,
    project,
    releaseDistPath,
  };
}
