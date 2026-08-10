/**
 * Headless instance provisioning — the non-interactive counterpart to the
 * `@clack` install wizard (commands/wizard.ts). Turns install flags into the
 * exact loopback API calls the wizard makes (bootstrap-admin + self-register),
 * so `vibrail up --non-interactive …` provisions a box end-to-end without a TTY.
 *
 * The loopback API is internal-token-gated; the caller passes the token
 * (from `ensureInternalToken()`) so this module has no dependency on the `up`
 * command (avoids an import cycle). Secrets (admin password) come from flags/env,
 * never logged.
 *
 * The loopback API calls + internal token live in ./loopback-api — the SAME
 * copy the wizard uses (no duplication).
 */

import { internalPost, waitHealthy, bootstrapAdmin } from "./loopback-api";

export type DomainKind = "byo" | "free" | "none";

export interface InstallInputs {
  admin: { name: string; email: string; password: string };
  domain:
    | { kind: "byo"; hostname?: string }
    | { kind: "free"; slug: string; publicHost?: string }
    | { kind: "none" };
}

/** Thrown when required headless inputs are missing/invalid in --non-interactive
 *  mode — surfaced with an actionable message, exit non-zero. */
export class HeadlessInputError extends Error {
  readonly code = "HEADLESS_INPUT" as const;
  constructor(message: string) {
    super(message);
    this.name = "HeadlessInputError";
  }
}

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Bare hostname from a URL or `host[:port]`. */
function hostOf(value: string | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  try {
    if (raw.includes("://")) return new URL(raw).hostname || undefined;
  } catch {
    /* fall through */
  }
  return raw.replace(/^\/+/, "").split("/")[0]?.split(":")[0] || undefined;
}

export interface InstallFlags {
  adminName?: string;
  adminEmail?: string;
  adminPassword?: string;
  domainKind?: string;
  hostname?: string;
  slug?: string;
  publicUrl?: string;
}

/**
 * Resolve headless install inputs from flags/env. Throws HeadlessInputError with
 * a precise message on anything missing/invalid — never silently defaults a
 * credential. Admin password falls back to VIBRAIL_ADMIN_PASSWORD so it stays
 * out of argv/shell history.
 */
export function resolveInstallInputs(flags: InstallFlags): InstallInputs {
  const email = flags.adminEmail?.trim();
  const password = flags.adminPassword ?? process.env.VIBRAIL_ADMIN_PASSWORD;
  const name = flags.adminName?.trim() || (email ? email.split("@")[0]! : "");

  if (!email || !EMAIL_RE.test(email)) {
    throw new HeadlessInputError("Missing/invalid --admin-email for a non-interactive install.");
  }
  if (!password || password.length < 8) {
    throw new HeadlessInputError(
      "Missing --admin-password (or VIBRAIL_ADMIN_PASSWORD env), min 8 chars, for a non-interactive install.",
    );
  }
  const admin = { name: name || "Admin", email, password };

  const kindRaw = (flags.domainKind?.trim().toLowerCase() || (flags.publicUrl ? "byo" : "none")) as DomainKind;
  const hostname = flags.hostname?.trim() || hostOf(flags.publicUrl);

  switch (kindRaw) {
    case "none":
      return { admin, domain: { kind: "none" } };
    case "byo":
      return { admin, domain: { kind: "byo", hostname } };
    case "free": {
      const slug = (flags.slug?.trim() || (hostname ? hostname.split(".")[0] : "")).toLowerCase();
      if (!slug || !SLUG_RE.test(slug)) {
        throw new HeadlessInputError("--domain-kind free requires a valid --slug (lowercase letters, digits, hyphens).");
      }
      return { admin, domain: { kind: "free", slug, publicHost: hostOf(flags.publicUrl) } };
    }
    default:
      throw new HeadlessInputError(`Invalid --domain-kind "${flags.domainKind}" (expected byo | free | none).`);
  }
}

// Loopback helpers (internalPost / waitHealthy / bootstrapAdmin) come from
// ./loopback-api — one shared copy with the wizard. The headless flow builds on them.

/** Create the first admin; if one already exists, force it back to LOCAL auth
 *  with the given password (idempotent re-provision). */
async function bootstrapOrReset(
  port: string,
  admin: InstallInputs["admin"],
  token?: string,
): Promise<{ ok: boolean; message?: string }> {
  const boot = await bootstrapAdmin(port, admin, token);
  if (boot.ok && boot.message !== "already-exists") return { ok: true };
  if (boot.ok && boot.message === "already-exists") {
    const rr = await internalPost(
      port,
      "/api/system/reset-admin-password",
      { password: admin.password, email: admin.email, name: admin.name },
      token,
    );
    return rr.ok ? { ok: true, message: "reset-existing" } : { ok: false, message: rr.data?.error || "reset failed" };
  }
  return { ok: false, message: boot.message || "bootstrap failed" };
}

export interface ProvisionResult {
  adminReady: boolean;
  domainRegistered: boolean;
  liveUrl?: string;
  warnings: string[];
}

/**
 * Headlessly provision an already-installed local instance: wait for health,
 * create the admin (or reset), then register the domain per `inputs`. Returns a
 * result + warnings; only a failed admin bootstrap is fatal (throws).
 */
export async function headlessProvision(opts: {
  port: string;
  dashPort?: string;
  inputs: InstallInputs;
  /** Internal token for the loopback calls. Bare install → omit (falls back to
   *  the ~/.vibrail token file); Compose install → the stack's compose/.env
   *  token (composeInternalToken). */
  token?: string;
  /** Install method. Informational; provisioning calls are identical. */
  method?: "bare" | "compose";
  onLog?: (msg: string) => void;
}): Promise<ProvisionResult> {
  const { port, inputs, token } = opts;
  const log = opts.onLog ?? (() => {});
  const warnings: string[] = [];

  log("Waiting for the API to become healthy…");
  if (!(await waitHealthy(port))) {
    throw new HeadlessInputError("The API did not become healthy in time — check `vibrail logs`.");
  }

  log("Creating the admin account…");
  const admin = await bootstrapOrReset(port, inputs.admin, token);
  if (!admin.ok) throw new HeadlessInputError(`Could not create the admin account: ${admin.message}`);

  const dashPort = opts.dashPort ? Number(opts.dashPort) : undefined;
  const d = inputs.domain;
  let liveUrl: string | undefined;
  let domainRegistered = false;

  log(`Registering domain (${d.kind})…`);
  if (d.kind === "none") {
    await internalPost(port, "/api/system/self-register", { domainType: "byo" }, token);
    domainRegistered = true;
  } else if (d.kind === "byo") {
    const res = await internalPost(
      port,
      "/api/system/self-register",
      { domainType: "byo", ...(d.hostname ? { hostname: d.hostname } : {}) },
      token,
    );
    domainRegistered = res.ok;
    liveUrl = res.data?.url ?? (d.hostname ? `https://${d.hostname}` : undefined);
    if (!res.ok) warnings.push(`Domain registration returned: ${res.data?.error || "failed"}`);
  } else {
    // free — requires the box to be Cloud-connected already; the server rejects
    // otherwise (we surface that as a warning rather than inventing a token flow).
    const res = await internalPost(
      port,
      "/api/system/self-register",
      { domainType: "free", slug: d.slug, publicHost: d.publicHost, dashPort },
      token,
    );
    domainRegistered = res.ok;
    liveUrl = res.data?.url;
    if (!res.ok) {
      warnings.push(
        `Free .vibrail.app domain not registered: ${res.data?.error || "failed"}. ` +
          `A free domain needs the box connected to Vibrail Cloud first — connect it, or use --domain-kind byo.`,
      );
    }
  }

  return { adminReady: true, domainRegistered, liveUrl, warnings };
}
