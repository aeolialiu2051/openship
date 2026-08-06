import { Command } from "commander";
import chalk from "chalk";
import { hostname } from "node:os";
import { CLOUD_API_URL, CLOUD_DASHBOARD_URL } from "@repo/core";
import { addContext, DEFAULT_CONTEXT, setActiveContext } from "../lib/config";
import { fetchCaps } from "../lib/caps";
import { createBrowserLoginRequest, waitForBrowserLogin } from "../lib/browser-login";

export const loginCommand = new Command("login")
  .description("Sign in through your browser")
  .option("--token <token>", "Personal Access Token (vibrail_pat_...) for non-interactive login")
  .option("--no-browser", "Print the authorization URL without opening a browser")
  .option("--api-url <url>", "API base URL", CLOUD_API_URL)
  .option("--dashboard-url <url>", "Dashboard base URL", CLOUD_DASHBOARD_URL)
  .option("--context <name>", "Name of the context to store this login under", DEFAULT_CONTEXT)
  .action(async (opts) => {
    const apiUrl: string = opts.apiUrl || CLOUD_API_URL;
    const dashboardUrl: string = opts.dashboardUrl || CLOUD_DASHBOARD_URL;
    const contextName: string = opts.context || DEFAULT_CONTEXT;

    let token: string | undefined = opts.token;

    // Interactive: authorize in the browser. The CLI polls with an unguessable
    // state and exchanges the one-time code using PKCE, so the PAT never enters
    // a URL, browser history, shell history, or manual paste prompt.
    if (!token) {
      const request = createBrowserLoginRequest(dashboardUrl, hostname());
      console.log(
        chalk.bold("\n  Vibrail login\n") +
          chalk.dim("  Complete sign-in and authorization in your browser.\n"),
      );
      if (opts.browser !== false) {
        try {
          const { default: open } = await import("open");
          await open(request.authorizeUrl);
        } catch {
          // Browser open is best-effort; the URL is printed below regardless.
        }
      }
      console.log(
        chalk.dim("  If the browser didn't open, visit:\n") +
          chalk.cyan(`  ${request.authorizeUrl}\n`) +
          chalk.dim("  Waiting for authorization…\n"),
      );
      try {
        token = await waitForBrowserLogin(apiUrl, request);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`\n  ${message}\n`));
        process.exit(1);
      }
    }

    token = token?.trim();
    if (!token) {
      console.error(chalk.red("\n  No token provided.\n"));
      process.exit(1);
    }
    if (!token.startsWith("vibrail_pat_")) {
      console.error(
        chalk.red("\n  That doesn't look like a Vibrail token (expected vibrail_pat_…).\n"),
      );
      process.exit(1);
    }

    // Validate the token against an authenticated endpoint before storing.
    // 200 → valid; 403 → valid but lacks settings:read scope (still usable).
    let valid = false;
    let scoped = false;
    try {
      const res = await fetch(`${apiUrl}/api/tokens`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) valid = true;
      else if (res.status === 403) {
        valid = true;
        scoped = true;
      }
    } catch {
      console.error(
        chalk.red(`\n  Couldn't reach the API at ${apiUrl}. `) +
          chalk.dim("Is it running? Use --api-url for a different host.\n"),
      );
      process.exit(1);
    }

    if (!valid) {
      console.error(
        chalk.red("\n  Token rejected by the API. Check that it's valid and not revoked.\n"),
      );
      process.exit(1);
    }

    addContext(contextName, { apiUrl, dashboardUrl, token });
    setActiveContext(contextName);

    // Best-effort capability discovery so later commands can gate offline.
    await fetchCaps({ force: true }).catch(() => undefined);

    console.log(
      chalk.green(`\n  Logged in`) +
        chalk.dim(` (context "${contextName}"). Token saved to ~/.vibrail/config.json\n`),
    );
    if (scoped) {
      console.log(
        chalk.dim("  (Token lacks settings:read scope — some commands may be limited.)\n"),
      );
    }
  });
