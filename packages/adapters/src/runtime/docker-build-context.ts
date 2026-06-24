import { spawn } from "node:child_process";
import { access, cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

import ignore from "ignore";

import { STACKS, TRANSFER_EXCLUDES, type StackDefinition, type StackId } from "@repo/core";

import type { BuildConfig, LogCallback } from "../types";

import { injectGitToken } from "./build-pipeline";
import { generateDockerfile } from "./docker-build-plan";
import { resolveDockerfileCandidates, resolveDockerRootDirectory } from "./docker-paths";

/**
 * Per-clone timeout. Five minutes is generous for a depth-1 clone over
 * normal connectivity and still bounds a hung clone (DNS hang, dead
 * proxy, network partition) so the build fails with a clear error
 * instead of pinning a build slot until the outer build timeout.
 */
const GIT_CLONE_TIMEOUT_MS = 5 * 60_000;
const GIT_CHECKOUT_TIMEOUT_MS = 60_000;

/**
 * Run a git subcommand with stderr streamed into the build log and a
 * hard timeout. WHY each env / flag matters:
 *   - GIT_TERMINAL_PROMPT=0 — never prompt for credentials; fail fast.
 *   - GIT_ASKPASS=/bin/echo — backstop for git builds that still try
 *     the askpass path; echo returns empty so git errors out instead
 *     of hanging on a non-existent tty.
 *   - --progress (caller-supplied) — git silences progress when stdout
 *     isn't a tty; we force it so the build-log stream stays alive
 *     during long clones (visible movement, not an idle "Cloning…").
 *   - spawn (not exec) — argv array avoids shell interpolation of the
 *     repo URL / branch; we don't have a shell-injection vector but
 *     also no need for one.
 */
function spawnGit(
  args: string[],
  opts: { timeoutMs: number; onLog?: LogCallback },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "/bin/echo",
      },
    });

    let stderr = "";
    const emit = opts.onLog;
    const flushLine = (line: string) => {
      const trimmed = line.trimEnd();
      if (!trimmed) return;
      if (emit) {
        emit({ timestamp: new Date().toISOString(), message: trimmed, level: "info" });
      }
    };

    child.stdout?.on("data", (buf: Buffer) => {
      for (const ln of buf.toString().split(/\r?\n/)) flushLine(ln);
    });
    child.stderr?.on("data", (buf: Buffer) => {
      const text = buf.toString();
      stderr += text;
      // Git emits progress on stderr — stream it the same way as stdout
      // so the user sees activity, then surface the tail on failure.
      for (const ln of text.split(/\r?\n/)) flushLine(ln);
    });

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(
          `git ${args.find((a) => !a.startsWith("-")) ?? "command"} timed out after ${Math.round(
            opts.timeoutMs / 1000,
          )}s`,
        ),
      );
    }, opts.timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`git exited with code ${code}: ${stderr.trim().slice(-500) || "no stderr"}`));
    });
  });
}

const GENERATED_DOCKERFILE_NAME = "Dockerfile.openship";

type IgnoreMatcher = ReturnType<typeof ignore>;

function getDockerContextExcludes(config: BuildConfig): Set<string> {
  const stack = STACKS[config.stack as StackId] as StackDefinition | undefined;
  return new Set([...TRANSFER_EXCLUDES, ...(stack?.cacheDirs ?? [])]);
}

function shouldCopyPath(root: string, candidate: string, excludes: Set<string>): boolean {
  const rel = relative(root, candidate);
  if (!rel || rel === ".") return true;
  const parts = rel.split(sep).filter(Boolean);
  return !parts.some((part) => excludes.has(part));
}

function toPosixPath(value: string): string {
  return value.split(sep).filter(Boolean).join("/");
}

function shouldExcludeRelativePath(
  relativePath: string,
  excludes: Set<string>,
  dockerignoreMatcher?: IgnoreMatcher,
): boolean {
  const normalized = toPosixPath(relativePath);
  const parts = normalized.split("/").filter(Boolean);

  if (parts.some((part) => excludes.has(part))) {
    return true;
  }

  return dockerignoreMatcher?.ignores(normalized) ?? false;
}

async function loadDockerignoreMatcher(rootPath: string): Promise<IgnoreMatcher | undefined> {
  try {
    const content = await readFile(join(rootPath, ".dockerignore"), "utf-8");
    return ignore().add(content);
  } catch {
    return undefined;
  }
}

async function pruneContextDirectory(
  rootPath: string,
  currentPath: string,
  excludes: Set<string>,
  dockerignoreMatcher?: IgnoreMatcher,
): Promise<void> {
  const entries = await readdir(currentPath, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = join(currentPath, entry.name);
      const relativePath = relative(rootPath, absolutePath);

      if (shouldExcludeRelativePath(relativePath, excludes, dockerignoreMatcher)) {
        await rm(absolutePath, { recursive: true, force: true });
        return;
      }

      if (entry.isDirectory()) {
        await pruneContextDirectory(rootPath, absolutePath, excludes, dockerignoreMatcher);
      }
    }),
  );
}

async function resolveDockerfileName(
  contextDir: string,
  rootDirectory?: string,
  explicitDockerfilePath?: string,
): Promise<string | null> {
  const candidates = resolveDockerfileCandidates(rootDirectory, explicitDockerfilePath);

  for (const candidate of candidates) {
    const candidatePath = join(contextDir, ...candidate.split("/"));
    const exists = await access(candidatePath)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      return candidate;
    }
  }

  return null;
}

async function copyLocalSource(
  sourcePath: string,
  targetPath: string,
  excludes: Set<string>,
  dockerignoreMatcher?: IgnoreMatcher,
): Promise<void> {
  await cp(sourcePath, targetPath, {
    recursive: true,
    filter: (candidate) => {
      if (!shouldCopyPath(sourcePath, candidate, excludes)) {
        return false;
      }

      const rel = relative(sourcePath, candidate);
      if (!rel || rel === ".") {
        return true;
      }

      return !shouldExcludeRelativePath(rel, excludes, dockerignoreMatcher);
    },
    force: true,
  });
}

async function cloneGitSource(
  config: BuildConfig,
  targetPath: string,
  onLog?: LogCallback,
): Promise<void> {
  const cloneUrl = injectGitToken(config.repoUrl, config.gitToken);
  await spawnGit(
    [
      "-c",
      "credential.helper=",
      "clone",
      "--progress",
      "--depth",
      config.commitSha ? "50" : "1",
      "--branch",
      config.branch,
      cloneUrl,
      targetPath,
    ],
    { timeoutMs: GIT_CLONE_TIMEOUT_MS, onLog },
  );

  if (config.commitSha) {
    await spawnGit(
      [
        "-c",
        "credential.helper=",
        "-C",
        targetPath,
        "checkout",
        config.commitSha,
      ],
      { timeoutMs: GIT_CHECKOUT_TIMEOUT_MS, onLog },
    );
  }

  await rm(join(targetPath, ".git"), { recursive: true, force: true });
}

export interface DockerBuildContext {
  contextDir: string;
  contextEntries: string[];
  dockerfileName: string;
  rootDirectory: string;
  usesRepositoryDockerfile: boolean;
  cleanup(): Promise<void>;
}

export async function createDockerBuildContext(
  config: BuildConfig,
  opts?: { requireRepositoryDockerfile?: boolean; onLog?: LogCallback },
): Promise<DockerBuildContext> {
  const contextDir = await mkdtemp(join(tmpdir(), "openship-docker-context-"));
  const excludes = getDockerContextExcludes(config);
  const requireRepositoryDockerfile = opts?.requireRepositoryDockerfile ?? false;

  try {
    if (config.localPath) {
      const dockerignoreMatcher = await loadDockerignoreMatcher(config.localPath);
      await copyLocalSource(config.localPath, contextDir, excludes, dockerignoreMatcher);
    } else {
      // Pass the log callback so the clone's stderr/progress lines land
      // in the build-log stream instead of being silently buffered.
      await cloneGitSource(config, contextDir, opts?.onLog);
      const dockerignoreMatcher = await loadDockerignoreMatcher(contextDir);
      await pruneContextDirectory(contextDir, contextDir, excludes, dockerignoreMatcher);
    }

    const resolvedRootDirectory = await resolveDockerRootDirectory(
      contextDir,
      config.rootDirectory,
      config.localPath,
    );

    const repositoryDockerfileName = await resolveDockerfileName(
      contextDir,
      resolvedRootDirectory,
      config.dockerfilePath,
    );
    const hasRepositoryDockerfile = repositoryDockerfileName !== null;

    if (!hasRepositoryDockerfile && requireRepositoryDockerfile) {
      const expectedDockerfile = config.dockerfilePath?.trim() || "Dockerfile";
      throw new Error(
        `No Dockerfile found for this build context. Expected ${expectedDockerfile}${config.rootDirectory ? ` under ${config.rootDirectory}` : ""}.`,
      );
    }

    if (!hasRepositoryDockerfile) {
      await writeFile(
        join(contextDir, GENERATED_DOCKERFILE_NAME),
        generateDockerfile({
          ...config,
          rootDirectory: resolvedRootDirectory,
        }),
        "utf-8",
      );
    }

    const contextEntries = await readdir(contextDir);

    return {
      contextDir,
      contextEntries,
      dockerfileName: repositoryDockerfileName ?? GENERATED_DOCKERFILE_NAME,
      rootDirectory: resolvedRootDirectory,
      usesRepositoryDockerfile: hasRepositoryDockerfile,
      cleanup: async () => {
        await rm(contextDir, { recursive: true, force: true }).catch(() => {});
      },
    };
  } catch (error) {
    await rm(contextDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
