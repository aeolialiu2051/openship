/**
 * Locate the prebuilt Vibrail release dist that the migration wizard streams
 * to the operator's remote server. Thin wrapper over the shared release-dist
 * resolver (apps/api/src/lib/release-dist.ts) — this file only pins the
 * vibrail-specific spec (repo, asset name, repo-local dev path) and preserves
 * the typed VibrailReleaseDistMissingError the wizard controller catches.
 */

import type { ReleaseSource } from "@repo/core";
import {
  ReleaseDistMissingError,
  apiRootPath,
  readApiVersion,
  resolveReleaseDist,
  resolveReleaseDistOrNull,
  type ReleaseDistSpec,
} from "../../../lib/release-resolver";

const VIBRAIL_SOURCE: ReleaseSource = {
  mode: "github",
  repo: "aeolialiu2051/vibrail",
  assetTemplate: "vibrail-{tag}-linux-amd64.tar.gz",
};

function vibrailDistSpec(): ReleaseDistSpec {
  return {
    name: "vibrail",
    version: readApiVersion(),
    source: VIBRAIL_SOURCE,
    envOverride: "VIBRAIL_RELEASE_DIST_PATH",
    repoLocalPath: apiRootPath("release-dist"),
  };
}

export class VibrailReleaseDistMissingError extends Error {
  readonly code = "VIBRAIL_RELEASE_DIST_MISSING" as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "VibrailReleaseDistMissingError";
  }
}

/** Resolve (download on miss) the Vibrail release dist directory. */
export async function resolveVibrailDistDir(): Promise<string> {
  try {
    return (await resolveReleaseDist(vibrailDistSpec())).dir;
  } catch (err) {
    if (err instanceof ReleaseDistMissingError) {
      throw new VibrailReleaseDistMissingError(
        `${err.message} Build it with \`bun run --cwd apps/api build-release\` or set VIBRAIL_RELEASE_DIST_PATH.`,
        { cause: (err as { cause?: unknown }).cause },
      );
    }
    throw err;
  }
}

/** Non-throwing, no-download variant for preflight. */
export function resolveVibrailDistDirOrNull(): string | null {
  return resolveReleaseDistOrNull(vibrailDistSpec());
}
