/**
 * GitHub webhook handler - processes incoming GitHub App webhook events.
 *
 * Implements the WebhookProvider interface so it plugs into the
 * unified webhook dispatcher in modules/webhooks/.
 *
 * Handles:
 *   - installation.created  → store installation in DB
 *   - installation.deleted  → remove installation from DB
 *   - push                  → trigger branch-matched redeployment
 *   - check_run             → acknowledged, no action
 */

import { repos } from "@repo/db";
import { env } from "../../config/env";
import { verifyHmacSha256 } from "../webhooks/webhook.service";
import { resolveProjectWebhookSecret } from "./github.service";
import { handleInstallation } from "./webhook-installation";
import { handlePush } from "./webhook-push";
import { handleCheckRun } from "./webhook-check-run";
import type {
  WebhookProvider,
  WebhookVerifyResult,
  WebhookHandlerResult,
} from "../webhooks/webhook.types";
import type {
  GitHubCheckRunPayload,
  GitHubInstallationPayload,
  GitHubPushPayload,
} from "./github.types";

// ─── Per-project webhook secret resolution ──────────────────────────────────

/**
 * HIGH #9 — find the signing secret to verify this delivery against.
 *
 * Peeks at the JSON payload to recover the `repository.full_name`, looks
 * up the owning project row, and returns its decrypted webhookSecret.
 * Returns null when:
 *   - the body isn't parseable JSON (verify will fall back to env),
 *   - the event is not repo-scoped (installation, ping → env fallback),
 *   - no project matches the repo (rogue delivery → env fallback so
 *     the verifier can still reject if the env secret doesn't match).
 *
 * The lookup tolerates branch divergence: a single (owner, repo) may be
 * registered on multiple projects (different environments / branches),
 * and any of their secrets is a legitimate signer of the SAME delivery
 * — GitHub only sends one webhook per (repo, hook id) so all matching
 * projects share the GitHub-side secret. We try each project's secret
 * in turn so a rotation that hasn't propagated to every environment row
 * still verifies.
 */
async function resolveDeliverySecret(
  payload: string | Buffer,
  headers: Record<string, string>,
): Promise<string | null> {
  const event = headers["x-github-event"];
  // installation / ping events aren't repo-scoped on the deploy side —
  // they hit api.openship.io's App webhook, which is verified with the
  // env secret (no project context exists there).
  if (event !== "push" && event !== "check_run") return null;

  let parsed: unknown;
  try {
    const text = Buffer.isBuffer(payload) ? payload.toString("utf8") : payload;
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const repoFull =
    (parsed as { repository?: { full_name?: string } })?.repository?.full_name;
  if (!repoFull || typeof repoFull !== "string") return null;
  const [owner, repo] = repoFull.split("/");
  if (!owner || !repo) return null;

  const projects = await repos.project.findByGitRepo(owner, repo).catch(() => []);
  for (const p of projects) {
    const secret = resolveProjectWebhookSecret(p);
    // resolveProjectWebhookSecret may return the env secret as a
    // fallback when project.webhookSecret is null. We want THIS path
    // to surface only the per-project value — verify() handles the env
    // fallback itself. So short-circuit when we get a real per-project
    // value (project.webhookSecret was non-null).
    if (p.webhookSecret && secret) return secret;
  }
  return null;
}

// ─── GitHub Webhook Provider ─────────────────────────────────────────────────

export const githubWebhookProvider: WebhookProvider = {
  name: "github",

  // HIGH #9 — verify against the per-project secret first; fall back to
  // env.GITHUB_WEBHOOK_SECRET for legacy hooks registered before per-
  // project secrets existed (and for non-deploy events that have no
  // owning project, e.g. installation events on the SaaS).
  async verify(
    payload: string | Buffer,
    headers: Record<string, string>,
  ): Promise<WebhookVerifyResult> {
    const signature = headers["x-hub-signature-256"];

    // First, identify the project for this delivery so we can look up
    // ITS secret. Best-effort: deliveries without a routable repo
    // (installation events, pings) fall through to the env secret.
    const projectSecret = await resolveDeliverySecret(payload, headers);
    const secret = projectSecret ?? env.GITHUB_WEBHOOK_SECRET ?? null;

    if (!secret) {
      if (env.CLOUD_MODE || env.GITHUB_AUTH_MODE === "app") {
        return { valid: false, error: "GITHUB_WEBHOOK_SECRET is required in GitHub App mode" };
      }

      // Self-hosted installs may use unsigned repo webhooks while setting up.
      return { valid: true };
    }

    // Secret configured but no signature in request - reject
    if (!signature) {
      return { valid: false, error: "Missing x-hub-signature-256 header" };
    }

    const valid = verifyHmacSha256(payload, secret, signature);
    return valid ? { valid: true } : { valid: false, error: "Invalid signature" };
  },

  async handle(payload: unknown, headers: Record<string, string>): Promise<WebhookHandlerResult> {
    const event = headers["x-github-event"];
    if (!event) {
      return { success: true, event: "unknown", message: "Missing x-github-event header" };
    }

    switch (event) {
      case "installation":
        return handleInstallation(payload as GitHubInstallationPayload);
      case "push":
        return handlePush(payload as GitHubPushPayload);
      case "check_run":
        return handleCheckRun(payload as GitHubCheckRunPayload);
      case "ping":
        return { success: true, event, message: "Pong" };
      default:
        return { success: true, event, message: `Event '${event}' not handled` };
    }
  },
};
