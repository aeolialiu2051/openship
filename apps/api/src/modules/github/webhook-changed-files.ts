/**
 * Extract the changed-files set + force-all signal from a GitHub push payload.
 *
 * Used by the webhook handler to drive smart per-service deploys —
 * services whose `rootDirectory` doesn't appear in the changed set are
 * marked `skipped` rather than rebuilt.
 *
 * "forceAll" overrides smart routing and rebuilds every service. We
 * derive it from three signals:
 *
 *   1. `payload.forced === true` (a `git push --force`). The commit
 *      list is unreliable in that case; the caller should still call
 *      `compareCommits(before, after)` if it cares about the file set.
 *   2. `head_commit.message` contains `[force]`, `[force-deploy]`, or
 *      `[redeploy-all]` (case-insensitive).
 *   3. A root-config file changed (Dockerfile, compose, package.json,
 *      .dockerignore at repo root) — any of these affect every service.
 *   4. For monorepos (`framework === "monorepo"` or compose-style
 *      projects) a `packages/**` file changed — v1 assumes any shared
 *      package may affect every sub-app and forces all.
 *
 * The caller passes a `compareCommits` function (optional) so we can
 * unit-test without hitting the network. When the push event truncates
 * commits[] at 20, we call it; otherwise we union commits[].(added |
 * modified | removed).
 */

import type { GitHubPushPayload } from "./github.types";

export interface ChangedFilesResult {
  files: Set<string>;
  forceAll: boolean;
  /** Why forceAll was set, when it was. */
  reason?: string;
  /** Whether the file set was truncated and could not be recovered. */
  truncated?: boolean;
}

export interface CompareCommitsFn {
  (
    owner: string,
    repo: string,
    base: string,
    head: string,
  ): Promise<{ files: string[] } | null>;
}

interface ExtractOptions {
  /**
   * Optional hook used to fan out to GitHub's compare API when the push
   * truncated commits[]. Called with (owner, repo, base, head).
   */
  compareCommits?: CompareCommitsFn;
  /**
   * Project type — currently only `framework: "monorepo"` triggers
   * shared-package detection.
   */
  isMonorepo?: boolean;
  /**
   * Optional monorepo shared paths. When provided AND non-empty, any
   * file under one of these path prefixes triggers forceAll. Null or
   * empty = the shared-paths check is skipped entirely (smart per-service
   * routing only). There is no built-in default: in pnpm-workspace
   * layouts `packages/web` is itself a deployable service, so a
   * one-size-fits-all default of `["packages/", "libs/"]` would
   * force-rebuild everything on every push.
   */
  monorepoSharedPaths?: string[] | null;
}

const FORCE_TOKEN_RE = /\[(force|force-deploy|redeploy-all)\]/i;

const ROOT_CONFIG_FILES = new Set([
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
  ".dockerignore",
  "package.json",
]);

function normalizeSharedPrefix(p: string): string {
  // Accept both "packages" and "packages/**"; normalize to "packages/".
  let s = p.trim();
  if (!s) return "";
  s = s.replace(/\*+$/g, "");      // strip trailing *'s
  s = s.replace(/\*+\/?$/g, "");
  if (!s.endsWith("/")) s += "/";
  return s;
}

export async function extractChangedFiles(
  payload: GitHubPushPayload,
  opts: ExtractOptions = {},
): Promise<ChangedFilesResult> {
  const owner = payload.repository?.owner?.login;
  const repo = payload.repository?.name;
  const before = payload.before;
  const after = payload.after;

  // 1. Force-push: the commit list is unreliable — the caller will call
  //    compareCommits separately if it wants the file list. We mark
  //    forceAll so smart routing is bypassed regardless.
  if (payload.forced) {
    return { files: new Set<string>(), forceAll: true, reason: "force-push" };
  }

  // 2. Build the changed-files set.
  let files: Set<string>;
  let truncated = false;

  const commits = payload.commits ?? [];
  // GitHub clamps payload.commits at 20 today; treat >= 20 as
  // "potentially truncated" so a future bump (or an off-by-one in the
  // docs) doesn't silently strand commits.
  if (
    commits.length >= 20 &&
    opts.compareCommits &&
    owner &&
    repo &&
    before &&
    after
  ) {
    // commits[] is clamped to 20 per push — fall back to compare API
    // so smart routing sees the full set.
    const compare = await opts.compareCommits(owner, repo, before, after);
    if (compare) {
      files = new Set(compare.files);
    } else {
      // compare failed → degrade to the truncated commits[] union and
      // signal upstream that the deploy may be missing some changes.
      files = unionCommitFiles(commits);
      truncated = true;
    }
  } else {
    files = unionCommitFiles(commits);
  }

  // 3. Commit-message force token.
  const headMessage = payload.head_commit?.message ?? "";
  if (FORCE_TOKEN_RE.test(headMessage)) {
    return { files, forceAll: true, reason: "commit-token", truncated };
  }

  // 4. Root-config triggers (Dockerfile, compose, package.json, …).
  for (const f of files) {
    if (ROOT_CONFIG_FILES.has(f)) {
      return { files, forceAll: true, reason: "root-config", truncated };
    }
  }

  // 5. Monorepo shared-package detection. Only runs when the project
  //    has explicitly configured `monorepoSharedPaths` to a non-empty
  //    list. No built-in default — see comment on the field for why.
  if (opts.isMonorepo && opts.monorepoSharedPaths && opts.monorepoSharedPaths.length > 0) {
    const prefixes = opts.monorepoSharedPaths
      .map(normalizeSharedPrefix)
      .filter(Boolean);
    if (prefixes.length > 0) {
      for (const f of files) {
        if (prefixes.some((p) => f.startsWith(p))) {
          return { files, forceAll: true, reason: "shared-package", truncated };
        }
      }
    }
  }

  return { files, forceAll: false, truncated };
}

function unionCommitFiles(commits: GitHubPushPayload["commits"] = []): Set<string> {
  const out = new Set<string>();
  for (const c of commits ?? []) {
    for (const f of c.added ?? []) out.add(f);
    for (const f of c.modified ?? []) out.add(f);
    for (const f of c.removed ?? []) out.add(f);
  }
  return out;
}

/**
 * Decide whether a service is affected by the given changed-files set.
 *
 * Matching rule: any file whose path starts with `${rootDirectory}/`
 * counts. A root-directory of `""` or `"."` means "the project IS the
 * service" — always matches.
 */
export function serviceMatchesChanges(
  rootDirectory: string | null | undefined,
  changedFiles: Iterable<string>,
): boolean {
  const root = (rootDirectory ?? "").trim();
  if (!root || root === ".") return true;
  const normalized = root.replace(/^\/+/, "").replace(/\/+$/, "");
  const prefix = `${normalized}/`;
  for (const f of changedFiles) {
    if (f === normalized || f.startsWith(prefix)) return true;
  }
  return false;
}
