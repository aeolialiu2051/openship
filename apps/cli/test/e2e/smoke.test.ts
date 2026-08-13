/**
 * Black-box smoke: spawn the real assembled CLI (src/index.ts via tsx) and
 * assert arg parsing, help, version, and error exit codes. No mocks — this is
 * the whole `commander` program wired exactly as the built binary wires it.
 * `__CLI_VERSION__` (a tsup build-time define) is injected for the tsx run.
 *
 * Actions that would hit the network/servers are never triggered here — only
 * --help / --version / bad-args paths, which resolve before any action runs.
 */
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = join(here, "..", "..");
const inject = join(here, "..", "helpers", "inject-version.mjs");
const entry = join(cliRoot, "src", "index.ts");

function runCli(
  args: string[],
  extraEnv: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ["--import", "tsx", "--import", inject, entry, ...args],
      { cwd: cliRoot, env: { ...process.env, ...extraEnv } },
      (error, stdout, stderr) => {
        const code = error && typeof (error as { code?: number }).code === "number"
          ? (error as { code: number }).code
          : error
            ? 1
            : 0;
        resolve({ stdout, stderr, code });
      },
    );
  });
}

describe("cli smoke", { timeout: 40_000 }, () => {
  it("prints the injected version", async () => {
    const { stdout, code } = await runCli(["--version"]);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe("0.0.0-test");
  });

  it("renders top-level help listing the core commands", async () => {
    const { stdout, code } = await runCli(["--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("vibrail");
    for (const cmd of ["deploy", "server", "project", "mail", "login"]) {
      expect(stdout).toContain(cmd);
    }
  });

  it("renders a subcommand's help", async () => {
    const { stdout, code } = await runCli(["server", "--help"]);
    expect(code).toBe(0);
    expect(stdout.toLowerCase()).toContain("server");
    expect(stdout).toContain("--help");
  });

  it("defaults login to the hosted Vibrail production endpoint", async () => {
    const { stdout, code } = await runCli(["login", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("https://app.vibrail.com/api/proxy");
    expect(stdout).toContain("https://app.vibrail.com");
    expect(stdout).not.toContain("http://localhost:4000");
    expect(stdout).not.toContain("http://localhost:3001");
  });

  it("derives the hosted login endpoint from VIBRAIL_APP_DOMAIN", async () => {
    const { stdout, code } = await runCli(["login", "--help"], {
      VIBRAIL_APP_DOMAIN: "next.vibrail.example",
      VIBRAIL_CLOUD_API_URL: "",
      VIBRAIL_CLOUD_DASHBOARD_URL: "",
    });
    expect(code).toBe(0);
    expect(stdout).toContain("https://next.vibrail.example/api/proxy");
    expect(stdout).toContain("https://next.vibrail.example");
  });

  it("exits non-zero on an unknown command", async () => {
    const { stderr, code } = await runCli(["definitely-not-a-command"]);
    expect(code).not.toBe(0);
    expect(stderr.toLowerCase()).toContain("error");
  });

  it("exits non-zero when a required subcommand argument is missing", async () => {
    // `server rm` needs a server id operand.
    const { code } = await runCli(["server", "rm"]);
    expect(code).not.toBe(0);
  });
});
