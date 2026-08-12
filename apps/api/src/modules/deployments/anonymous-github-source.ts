import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ProjectInfo } from "./prepare.service";

const execFileAsync = promisify(execFile);

/**
 * Prepare a public GitHub repository without an account or API token.
 *
 * The unauthenticated GitHub REST allowance is shared and small (60 requests
 * per hour per egress IP), while preparation normally needs several reads.
 * A shallow anonymous clone is both the authoritative public-access check and
 * gives the detector the whole source tree without consuming that allowance.
 */
export async function resolveAnonymousGitHubSource(
  owner: string,
  repo: string,
  requestedBranch?: string,
): Promise<ProjectInfo> {
  const checkout = await mkdtemp(join(tmpdir(), "vibrail-public-repo-"));
  const cloneUrl = `https://github.com/${owner}/${repo}.git`;

  try {
    const cloneArgs = ["clone", "--depth", "1", "--single-branch"];
    if (requestedBranch) cloneArgs.push("--branch", requestedBranch);
    cloneArgs.push("--", cloneUrl, checkout);

    await execFileAsync("git", cloneArgs, {
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });

    const { stdout } = await execFileAsync(
      "git",
      ["-C", checkout, "branch", "--show-current"],
      { timeout: 10_000, maxBuffer: 64 * 1024 },
    );
    const branch = requestedBranch || stdout.trim() || "main";
    const { resolveClonedGitHubSource } = await import("./local-source");
    return await resolveClonedGitHubSource(checkout, { owner, name: repo, branch });
  } finally {
    await rm(checkout, { recursive: true, force: true });
  }
}
