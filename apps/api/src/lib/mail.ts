import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";
import { repos } from "@repo/db";
import { cloudClient } from "./cloud/client";
import { decrypt } from "./encryption";

/**
 * System/transactional email sender.
 *
 * This module deliberately never reads `mail_servers` or authenticates to a
 * mailbox on a user-owned target server. Hosted mail servers are tenant
 * resources; Cloud verification codes, password resets, billing notices and
 * other control-plane messages belong to the platform trust boundary.
 *
 * Transport policy:
 *   - CLOUD_MODE: environment SMTP only (`SMTP_*`). Missing configuration is a
 *     hard delivery error so required verification cannot silently deadlock.
 *   - self-hosted: Settings → Email instance SMTP first, then environment SMTP.
 *   - a self-hosted organization may explicitly relay an invitation through
 *     Openship Cloud with `preferSource: "cloud"`.
 */

export type SendMailSource = "local" | "cloud" | "auto";

export type SendMailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /**
   * Preferred system-mail source. Default "auto" uses the transports owned by
   * this Openship process. "local" is an explicit alias for that self-hosted
   * path. "cloud" routes through the SaaS invitation relay from a self-hosted
   * instance and resolves to the SaaS environment transport on the SaaS.
   */
  preferSource?: SendMailSource;
  /**
   * Organization ID for the cloud relay path. Required when
   * `preferSource === "cloud"` and we are NOT the SaaS — the cloudClient
   * uses it to resolve the org owner's cloud session token. Ignored on
   * other paths.
   */
  organizationId?: string;
};

// ─── Env-based transport (singleton) ─────────────────────────────────────────

/** True when env SMTP credentials are all present. */
const envSmtpConfigured = !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

const envTransport: Transporter | null = envSmtpConfigured
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: (env.SMTP_PORT ?? 587) === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    })
  : null;

const envFrom = env.SMTP_FROM;

/**
 * Resend's SMTP password is the same API key accepted by its HTTPS API. Raw
 * SMTP ports are commonly blocked or mishandled by desktop proxy fake-IP
 * modes, while HTTPS/443 remains available. Prefer HTTPS for this provider and
 * retain SMTP as the fallback; other SMTP providers keep the normal path.
 */
const resendHttpConfigured =
  env.SMTP_HOST?.trim().toLowerCase() === "smtp.resend.com" &&
  env.SMTP_USER?.trim().toLowerCase() === "resend" &&
  !!env.SMTP_PASS;

async function sendViaResendHttp(opts: SendMailOptions): Promise<void> {
  if (!resendHttpConfigured || !env.SMTP_PASS) {
    throw new Error("Resend HTTPS transport is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SMTP_PASS}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: envFrom,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      ...(opts.text ? { text: opts.text } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(
      `Resend HTTPS API returned ${response.status}${detail ? `: ${detail}` : ""}`,
    );
  }
}

// ─── Instance SMTP transport (operator-configured, DB-backed) ────────────────

const INSTANCE_TRANSPORT_TTL_MS = 60_000;
let instanceTransportCache: { transport: Transporter; from: string | undefined } | null = null;
let instanceTransportCheckedAt = 0;

/**
 * Operator-configured SMTP from `instance_settings` (Settings → Email). The
 * deliberate, instance-wide transport for ALL system mail — the highest
 * priority source in getActiveTransport.
 *
 * The password is decrypted from `smtpPasswordEncrypted`; a decrypt failure
 * (e.g. rotated ENCRYPTION_KEY) DISABLES this source (returns null) rather
 * than throwing, so it can't brick every outbound email. Result is cached
 * 60s (positive AND negative), invalidated on save via
 * invalidateInstanceTransportCache().
 */
async function getInstanceTransport(): Promise<{
  transport: Transporter;
  from: string | undefined;
} | null> {
  // Self-hosted only. On the SaaS (CLOUD_MODE) a stray instance_settings SMTP
  // row must never override the platform's own multi-tenant transport.
  if (env.CLOUD_MODE) return null;

  const now = Date.now();
  if (now - instanceTransportCheckedAt < INSTANCE_TRANSPORT_TTL_MS) {
    return instanceTransportCache; // may be null (cached "not configured")
  }
  instanceTransportCheckedAt = now;
  instanceTransportCache = null;

  let settings: Awaited<ReturnType<typeof repos.instanceSettings.get>>;
  try {
    settings = await repos.instanceSettings.get();
  } catch (err) {
    console.warn("[mail] instance-settings lookup failed:", err);
    return null;
  }

  const host = settings?.smtpHost?.trim();
  const user = settings?.smtpUser?.trim();
  const sealed = settings?.smtpPasswordEncrypted;
  if (!host || !user || !sealed) return null;

  let pass: string;
  try {
    pass = decrypt(sealed);
  } catch (err) {
    console.warn(
      "[mail] instance SMTP password failed to decrypt - disabling instance transport:",
      err,
    );
    return null;
  }

  const port = settings?.smtpPort ?? 587;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  instanceTransportCache = { transport, from: settings?.smtpFrom?.trim() || user };
  return instanceTransportCache;
}

/**
 * Drop the cached instance transport so the next send re-reads
 * `instance_settings`. Call after saving the SMTP config.
 */
export function invalidateInstanceTransportCache(): void {
  instanceTransportCache = null;
  instanceTransportCheckedAt = 0;
}

/**
 * Send a verification email through the operator's configured instance SMTP.
 * Unlike sendMail (which swallows failures), this THROWS the real transport
 * error so the Settings → Email "Send test" button can surface it. Throws if
 * instance SMTP isn't configured.
 */
export async function sendInstanceTestEmail(to: string): Promise<void> {
  const active = await getInstanceTransport();
  if (!active) {
    throw new Error("Instance SMTP is not configured.");
  }
  await active.transport.sendMail({
    from: active.from,
    to,
    subject: "Openship SMTP test",
    text:
      "This is a test message from your Openship instance SMTP configuration. " +
      "If you received it, outbound email (password resets, invites, notifications) works.",
  });
}

// ─── Public surface ──────────────────────────────────────────────────────────

/**
 * Better Auth needs callbacks wired at module-load time. Runtime transport
 * availability is enforced by sendMail/canSendMail; target mail servers are
 * intentionally not considered a system-mail capability.
 *
 * `requireEmailVerification` should NOT be derived from this — use
 * `requireEmailVerificationStrict` (env-only) so a self-hosted install without
 * system SMTP does not require a verification message it cannot deliver.
 */
export const smtpEnabled = true; // callbacks wired; runtime decides delivery

/**
 * Env-only flag for gating email verification on self-hosted installs. Cloud
 * always requires verification and sendMail throws if its platform SMTP is
 * missing.
 */
export const requireEmailVerificationStrict = envSmtpConfigured;

/** Runtime check — true if any source could currently deliver. */
export async function canSendMail(): Promise<boolean> {
  if (envSmtpConfigured) return true;
  if (env.CLOUD_MODE) return false;
  return (await getInstanceTransport()) !== null;
}

interface ActiveTransport {
  transport: Transporter;
  from: string | undefined;
  source: "instance" | "env";
}

/**
 * Build the system-mail transport chain without crossing into tenant mail
 * infrastructure. Cloud is env-only. Self-hosted instances may use their
 * operator-configured instance SMTP and then their deployment env fallback.
 */
async function getTransportChain(): Promise<ActiveTransport[]> {
  const chain: ActiveTransport[] = [];
  if (env.CLOUD_MODE) {
    if (envTransport) {
      chain.push({ transport: envTransport, from: envFrom, source: "env" });
    }
    return chain;
  }
  const instance = await getInstanceTransport();
  if (instance) {
    chain.push({ transport: instance.transport, from: instance.from, source: "instance" });
  }
  if (envTransport) chain.push({ transport: envTransport, from: envFrom, source: "env" });
  return chain;
}

/**
 * Send a system email. Missing Cloud SMTP is a hard error; self-hosted installs
 * without system SMTP retain the historical warn-and-skip behaviour.
 */
export async function sendMail(opts: SendMailOptions): Promise<void> {
  const preferSource = opts.preferSource ?? "auto";

  // Cloud relay branch — only meaningful on a local self-hosted instance.
  // When CLOUD_MODE=true we ARE the SaaS, so "cloud" falls through to the
  // env-only platform transport below.
  if (preferSource === "cloud" && !env.CLOUD_MODE) {
    if (!opts.organizationId) {
      throw new Error("preferSource=cloud requires organizationId");
    }
    // cloud-client is dual-side (local outbound → SaaS) with no local-
    // only side effects on import, so static import is fine. Cargo-cult
    // comment about matching "platform-transport pattern" was wrong —
    // that one IS local-only, this one isn't.
    const result = await cloudClient({
      organizationId: opts.organizationId,
    }).sendInvitation({
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text ?? stripHtmlForText(opts.html),
    });
    if (!result.ok) {
      throw new Error(
        `Cloud invitation relay failed for org=${opts.organizationId}: ${result.error}`,
      );
    }
    return;
  }

  const chain = await getTransportChain();
  if (chain.length === 0) {
    const message = env.CLOUD_MODE
      ? "Cloud platform SMTP is not configured (SMTP_HOST, SMTP_USER and SMTP_PASS are required)"
      : `No system-mail transport configured (preferSource=${preferSource})`;
    if (env.CLOUD_MODE) throw new Error(message);
    console.warn(`[mail] ${message} - skipping email to`, opts.to);
    return;
  }

  // Try each transport in priority order; fail over to the next on a send
  // error so one broken source (e.g. wrong instance-SMTP creds) doesn't block
  // delivery when another can carry it. Throw only when every source fails.
  let lastErr: unknown = null;
  for (let i = 0; i < chain.length; i++) {
    const active = chain[i];

    // Resend accepts the SMTP password as an HTTPS API key. Use its API first
    // so local proxy/firewall failures on port 465 do not hold the auth request
    // open until the TLS socket times out. SMTP remains a provider fallback.
    if (active.source === "env" && resendHttpConfigured) {
      try {
        await sendViaResendHttp(opts);
        console.info("[mail] sent via Resend HTTPS API");
        return;
      } catch (httpErr) {
        lastErr = httpErr;
        console.warn("[mail] Resend HTTPS API failed - trying SMTP fallback:", httpErr);
      }
    }

    try {
      await active.transport.sendMail({
        from: active.from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
      });
      return;
    } catch (err) {
      lastErr = err;
      const more = i < chain.length - 1;
      console.warn(
        `[mail] send via ${active.source} transport failed${more ? " - trying next source" : ""}:`,
        err,
      );
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All mail transports failed");
}

/**
 * Minimal HTML → plaintext fallback for the cloud relay when a caller
 * supplied only HTML. The SaaS endpoint requires `text` (it never sees
 * the rendered HTML beyond passthrough), so we collapse tags so the
 * payload still validates.
 */
function stripHtmlForText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
