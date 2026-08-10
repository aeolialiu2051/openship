/**
 * Interactive setup — what runs when you type `vibrail` with no subcommand.
 *
 * The one-command self-deploy: ask a few questions, then reuse the exact
 * `vibrail up` pipeline (prebuilt API + dashboard, no build) to install
 * Vibrail as a boot service, create the first admin, and — reusing Vibrail's
 * OWN app + domain pipeline — register the control plane as an **app** (it shows
 * up under Apps) with a domain:
 *   - Free   name.vibrail.app  → Vibrail Cloud edge (Oblien); connects Cloud in-flow
 *   - Custom your-domain   → Traefik + a free Let's Encrypt cert on this box
 *   - BYO    your-domain   → you run your own reverse proxy in front
 *
 * No new deploy machinery — Vibrail deploys itself with its own tools.
 * UI is @clack/prompts (modern, keyboard-driven).
 */

import chalk from "chalk";
import { SYSTEM } from "@repo/core";
import open from "open";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  intro,
  outro,
  text,
  password,
  select,
  spinner,
  note,
  log,
  cancel,
  isCancel,
} from "@clack/prompts";

import { startService, normalizeUrl } from "./up";
import {
  ensureInternalToken,
  internalGet,
  internalPost,
  bootstrapAdmin,
  waitHealthy,
  waitDashboard,
  detectPublicIp,
  OS_DIR,
} from "../lib/loopback-api";
import { ensureDashboard } from "../lib/dashboard";
import { serviceStatus, stop as stopService, restart as restartService } from "../lib/service";
import { saveInstanceUrl, readInstanceUrl } from "../lib/ports";
import { runRepair, looksCorrupted, lastServiceError } from "../lib/repair";
import {
  ensureDocker,
  hasDockerCompose,
  composeUp,
  composeInternalToken,
  sourceBuildDir,
} from "../lib/compose";
import { headlessProvision, type InstallInputs } from "../lib/instance-provision";

declare const __CLI_VERSION__: string;

/** Exit cleanly on Ctrl-C / Esc; otherwise narrow away clack's cancel symbol. */
function ensure<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Setup cancelled.");
    process.exit(0);
  }
  return value as T;
}

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const SETUP_LOCK = join(OS_DIR, "setup-in-progress");

/* Loopback API helpers (internalGet/internalPost/bootstrapAdmin/waitHealthy/
 * waitDashboard/detectPublicIp) now live in lib/loopback-api and are imported
 * above — one copy shared with the headless installer + `vibrail up`. */

const b64url = (buf: Buffer) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * Connect the org owner to Vibrail Cloud via the browser PKCE handshake, then
 * finalize on the loopback API (internal-token gated). Returns the linked cloud
 * account (its email) on success, or null when not linked.
 */
async function connectVibrailCloud(port: string, token?: string): Promise<{ email: string | null } | null> {
  const already = await internalGet(port, "/api/system/cloud-status");
  if (already?.connected) {
    log.success(`Already connected to Vibrail Cloud${already.user?.email ? ` as ${already.user.email}` : ""}.`);
    return { email: already.user?.email ?? null };
  }

  const capsEnv = await internalGet(port, "/api/health/env");
  const cloudApiUrl: string | undefined = capsEnv?.cloudApiUrl;
  if (!cloudApiUrl) {
    log.error("Couldn't discover the Vibrail Cloud URL — free domain unavailable. Use a bring-your-own domain instead.");
    return null;
  }

  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(24)); // 192-bit unguessable poll capability

  const apiBase = cloudApiUrl.replace(/\/$/, "");
  // Device/poll handshake — the server-friendly flow (and fine locally too):
  // NO loopback listener and NO browser→box redirect. The CLI opens the auth
  // URL, the user clicks Authorize, and the CLI POLLS the SaaS with its
  // unguessable `state` to pick up the one-time, PKCE-locked code. This is why
  // it works over SSH — the browser (on the user's laptop) never has to reach
  // back to this box.
  //   - mode=device → the consent page confirms in-place; the code is delivered
  //     by the poll below, so there is NO redirect param at all.
  const handoff =
    `${apiBase}/api/cloud/connect-handoff` +
    `?state=${encodeURIComponent(state)}&code_challenge=${challenge}&mode=device`;

  const overSsh = !!(process.env.SSH_CONNECTION || process.env.SSH_TTY || process.env.SSH_CLIENT);
  // Print the URL as a bare, single-line, selectable value. clack's note() boxes
  // and gutters it, which wraps the URL across lines and makes it uncopyable.
  log.step("Open this URL in your browser to authorize, then click Authorize:");
  console.log("\n" + chalk.cyan.underline(handoff) + "\n");
  // A box with a desktop browser can auto-open it; over SSH there's none, so
  // the user opens the printed URL on their own machine.
  if (!overSsh) void open(handoff).catch(() => {});

  const s = spinner();
  s.start("Waiting for you to authorize in the browser");
  // Poll the SaaS for our code once the user approves. Fixed 2.5s cadence keeps
  // us well under the SaaS per-IP limit (300/min) across the 5-min window. The
  // box already needs SaaS reachability to finish the exchange below, so
  // polling here adds no new network requirement.
  let code: string | null = null;
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const res = await fetch(
        `${apiBase}/api/cloud/connect-poll?state=${encodeURIComponent(state)}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { status?: string; code?: string };
      if (data.status === "ready" && data.code) {
        code = data.code;
        break;
      }
    } catch {
      /* transient network blip — keep polling until the deadline */
    }
  }

  if (!code) {
    s.stop("Vibrail Cloud wasn't authorized in time — re-run the connect step to try again.", 1);
    return null;
  }
  s.stop("Authorized.");

  const linking = spinner();
  linking.start("Linking this instance to Vibrail Cloud");
  const res = await internalPost(port, "/api/system/cloud-connect", { code, codeVerifier: verifier }, token);
  if (!res.ok) {
    linking.stop(`Couldn't link Vibrail Cloud: ${res.data?.error || "failed"}`, 1);
    return null;
  }
  linking.stop(`Connected to Vibrail Cloud${res.data?.email ? ` as ${res.data.email}` : ""}.`);
  return { email: res.data?.email ?? null };
}

/** Prompt for a local admin (name / email / password). Used for the self-hosted
 *  paths and as the cloud-path fallback when the browser connect is declined. */
async function promptLocalAdmin(): Promise<{ name: string; email: string; password: string }> {
  const name = ensure(await text({ message: "Your name", validate: (v) => (v?.trim() ? undefined : "Required") })).trim();
  const email = ensure(
    await text({
      message: "Email",
      placeholder: "you@example.com",
      validate: (v) => (v?.includes("@") ? undefined : "Enter a valid email"),
    }),
  )
    .trim()
    .toLowerCase();
  const pw = ensure(
    await password({ message: "Password", validate: (v) => (v && v.length >= 8 ? undefined : "At least 8 characters") }),
  );
  ensure(await password({ message: "Confirm password", validate: (v) => (v === pw ? undefined : "Passwords don't match") }));
  return { name, email, password: pw };
}

/** Consume the self-register SSE stream, driving the spinner until done. */
/** True when a prior wizard run installed the service but never completed. */
export function isSetupInProgress(): boolean {
  return existsSync(SETUP_LOCK);
}
function markSetupStarted(): void {
  mkdirSync(OS_DIR, { recursive: true });
  writeFileSync(SETUP_LOCK, "1");
}
function markSetupDone(): void {
  rmSync(SETUP_LOCK, { force: true });
}

/** Map the wizard's collected domain plan to the shared provision pipe's inputs. */
function wizardInputs(
  admin: { name: string; email: string; password: string },
  plan:
    | { type: "free"; slug: string; publicHost: string }
    | { type: "byo"; hostname: string }
    | { type: "none" },
): InstallInputs {
  switch (plan.type) {
    case "free":
      return { admin, domain: { kind: "free", slug: plan.slug, publicHost: plan.publicHost } };
    case "byo":
      return { admin, domain: { kind: "byo", hostname: plan.hostname } };
    default:
      return { admin, domain: { kind: "none" } };
  }
}

/** Shared "Vibrail is live" summary + clear the in-progress marker + outro. */
function finishSetup(opts: {
  liveUrl: string;
  dashPort: string;
  apiPort: string;
  adminEmail: string;
  cloudEmail: string | null;
  method: "compose" | "bare";
  byo: boolean;
}): void {
  saveInstanceUrl(opts.liveUrl);
  markSetupDone();
  const pad = (label: string) => chalk.dim(label.padEnd(11));
  log.success(chalk.bold("Vibrail is live"));
  log.message(
    `${pad("URL")}${chalk.bold(opts.liveUrl)}\n` +
      `${pad("Dashboard")}http://localhost:${opts.dashPort}\n` +
      `${pad("API")}http://localhost:${opts.apiPort}\n` +
      `${pad("Login")}${opts.adminEmail} ${chalk.dim("(email + password you set)")}\n` +
      (opts.cloudEmail
        ? `${pad("Cloud")}${chalk.dim("connected as ")}${opts.cloudEmail}${chalk.dim(" — free domain + mail only")}\n`
        : "") +
      `${pad("Status")}${chalk.green("running")} ${chalk.dim(opts.method === "compose" ? "· Docker Compose stack (restarts on boot)" : "· service (restarts on boot)")}`,
  );
  log.message(
    chalk.dim("Sign in with the email + password you just set. Vibrail appears under your Apps.\n") +
      chalk.dim("Change the domain, Vibrail Cloud, team, and everything else anytime in Settings.\n") +
      chalk.dim(`Locked out? Run ${chalk.reset("vibrail reset-admin-password")}${chalk.dim(" on this machine — resets your login without signing in.")}`),
  );
  outro(opts.byo ? chalk.dim("Point your reverse proxy at the dashboard port above.") : chalk.green("Happy shipping."));
}

export async function runWizard(): Promise<void> {
  const resuming = isSetupInProgress();
  intro(`${chalk.bgCyan(chalk.black(" Vibrail "))}${chalk.dim(" setup")}`);
  if (resuming) {
    log.warn(
      "Your last setup didn't finish — picking it back up. Re-enter your details to complete it (or run `vibrail up` to just keep the server running).",
    );
  }
  log.message(
    chalk.dim(
      "Deploy Vibrail on this machine — a few questions, then it installs itself\nas a service, registers as an app, and prints the URL to log in.",
    ),
  );

  // 1. First-time admin — ALWAYS a local email + password, and the FIRST thing we
  //    ask. This is your instance login; the domain, Vibrail Cloud link, and every
  //    setting configured afterwards hang off this account. (Connecting Vibrail
  //    Cloud later only attaches the free domain + mail — it never becomes sign-in.)
  log.message(chalk.dim("First, your instance login (email + password) — this is how you sign in. Domain and Vibrail Cloud come next and never replace it."));
  const admin = await promptLocalAdmin();
  // Vibrail Cloud account attached for the free domain — display only, never the login.
  let cloudEmail: string | null = null;

  let publicUrl: string | undefined;
  let behindProxy = false;
  // Domain wiring executed AFTER the service + admin are up.
  let domainPlan:
    | { type: "free"; slug: string; publicHost: string }
    | { type: "byo"; hostname: string }
    | { type: "none" } = { type: "none" };

  // 2. Reachability + domain (settings that hang off the admin created above) — a
  //    small back-navigable state machine. Clack has no native "back", so each
  //    select offers "← Back" and captured inputs survive re-entry. Produces
  //    publicUrl / behindProxy / domainPlan.
  const BACK = "__back__";
  let slug = "";
  let byoDomainInput = "";
  let publicHost: string | null = null;

  // The server's public address — free-domain target + A-record hint. Auto-detect,
  // and PROMPT when that fails: the free-domain path requires it (without it the
  // free registration 400s with "Could not resolve this server's public address").
  async function resolvePublicHost(): Promise<string> {
    if (publicHost) return publicHost;
    const sp = spinner();
    sp.start("Detecting this server's public IP");
    const detected = await detectPublicIp();
    if (detected) {
      sp.stop(`Public IP: ${chalk.bold(detected)}`);
      publicHost = detected;
      return detected;
    }
    sp.stop("Couldn't detect the public IP automatically.", 1);
    publicHost = ensure(
      await text({
        message: "This server's public IP or hostname",
        placeholder: "203.0.113.10",
        validate: (v) => (v?.trim() ? undefined : "Required — the edge proxy routes traffic to this address"),
      }),
    ).trim();
    return publicHost;
  }

  type DomainStage = "reach" | "type" | "free" | "byo";
  let stage: DomainStage = "reach";

  log.message(chalk.dim("These are just starting choices — domain, Cloud, team, and the rest are all editable later in Settings."));

  planning: while (true) {
    if (stage === "reach") {
      const reach = ensure(
        await select({
          message: "How should this instance be reachable?",
          // Default to public — most people setting up on a server/VPS want a
          // domain + HTTPS; localhost-only is the deliberate opt-out.
          initialValue: "public",
          options: [
            { value: "public", label: "Public (server / VPS)", hint: "a domain + HTTPS, reachable from anywhere" },
            { value: "private", label: "This machine only", hint: "localhost — no domain, log in on this box" },
          ],
        }),
      );
      if (reach === "private") {
        domainPlan = { type: "none" };
        publicUrl = undefined;
        behindProxy = false;
        break planning;
      }
      stage = "type";
      continue;
    }

    if (stage === "type") {
      const domainType = ensure(
        await select({
          message: "How do you want a domain + HTTPS?",
          initialValue: "free",
          options: [
            { value: "free", label: "Free domain", hint: `name.${SYSTEM.DOMAINS.CLOUD_DOMAIN} via Vibrail Cloud — HTTPS handled for you` },
            { value: "byo", label: "Bring your own", hint: "your domain, behind your own reverse proxy" },
            { value: BACK, label: "← Back" },
          ],
        }),
      );
      if (domainType === BACK) {
        stage = "reach";
        continue;
      }
      stage = domainType as DomainStage;
      continue;
    }

    if (stage === "free") {
      slug = ensure(
        await text({
          message: "Choose your subdomain",
          placeholder: "my-vibrail",
          initialValue: slug || undefined,
          validate: (v) => (v && SLUG_RE.test(v.trim().toLowerCase()) ? undefined : "Lowercase letters, digits, hyphens"),
        }),
      )
        .trim()
        .toLowerCase();
      const host = await resolvePublicHost();
      note(
        `${chalk.cyan(`https://${slug}.${SYSTEM.DOMAINS.CLOUD_DOMAIN}`)}\n\n` +
          `  ${chalk.dim("served via")}  Vibrail Cloud edge  ${chalk.dim("→")}  ${chalk.cyan(host)}\n\n` +
          chalk.dim("Vibrail Cloud terminates HTTPS and forwards to this server."),
        "Confirm free domain",
      );
      const go = ensure(
        await select({
          message: "Create this free domain?",
          options: [
            { value: "go", label: "Create it" },
            { value: BACK, label: "← Back", hint: "change subdomain or IP" },
          ],
        }),
      );
      if (go === BACK) {
        stage = "type";
        continue;
      }
      publicUrl = `https://${slug}.${SYSTEM.DOMAINS.CLOUD_DOMAIN}`;
      behindProxy = true; // Oblien's edge sets a trusted XFF
      domainPlan = { type: "free", slug, publicHost: host };
      break planning;
    }

    // stage === "byo"
    const raw = ensure(
      await text({
        message: "Your domain (served behind your proxy)",
        placeholder: "ops.example.com",
        initialValue: byoDomainInput || undefined,
        validate: (v) => (v && normalizeUrl(v) ? undefined : "Enter a valid domain"),
      }),
    );
    byoDomainInput = raw;
    const url = normalizeUrl(raw)!;
    const hostname = new URL(url).hostname;
    if (url.startsWith("http://")) {
      log.warn("Serving over plain HTTP sends passwords in cleartext — put HTTPS in front before real use.");
    }
    note(
      `${chalk.cyan(url)}\n\n` + chalk.dim("Point your reverse proxy at the dashboard port shown at the end."),
      "Confirm",
    );
    const go = ensure(
      await select({
        message: "Continue?",
        options: [
          { value: "go", label: "Continue" },
          { value: BACK, label: "← Back", hint: "change the domain" },
        ],
      }),
    );
    if (go === BACK) {
      stage = "type";
      continue;
    }
    publicUrl = url;
    behindProxy = true;
    domainPlan = { type: "byo", hostname };
    break planning;
  }

  // 3. Choose how to run Vibrail. On a Linux server use the Docker Compose stack
  //    (containerized edge on 80/443 that hosts apps on THIS box, with real
  //    image-pull progress) — the same install `vibrail up` picks — auto-installing
  //    Docker via the same toolchain the deploy pipeline uses. macOS/Windows (no
  //    host-net Docker) and a failed Docker ensure fall back to the bare service.
  let method: "compose" | "bare" = "bare";
  if (process.platform === "linux") {
    if (hasDockerCompose()) {
      method = "compose";
    } else {
      log.step("Docker isn't installed — installing it now (get.docker.com)…");
      method = (await ensureDocker()) ? "compose" : "bare";
      if (method === "bare") {
        log.warn("Couldn't install Docker automatically — falling back to the bare process service.");
      }
    }
  }

  const uiTag = `v${__CLI_VERSION__}`;
  // Bare runs the downloaded dashboard bundle; Compose ships the dashboard inside
  // the image, so only the bare path pulls the dist (Compose shows pull progress).
  if (method === "bare") {
    const dl = spinner();
    dl.start("Pulling the Vibrail dist from GitHub");
    try {
      await ensureDashboard({
        tag: uiTag,
        onProgress: (received, total) => {
          if (total) dl.message(`Pulling the Vibrail dist from GitHub — ${Math.round((received / total) * 100)}%`);
        },
      });
      dl.stop("Vibrail dist ready.");
    } catch (e) {
      dl.stop(`Couldn't pull the Vibrail dist: ${(e as Error).message}`, 1);
      log.info("Check your network / that this release published its dashboard asset, then re-run `vibrail`.");
      process.exit(1);
    }
  }

  // From here the service/stack exists, so serviceStatus().installed is true even
  // if the user bails at the cloud/domain step below — mark setup in-progress so
  // the next launch resumes here instead of jumping to the control panel.
  markSetupStarted();

  const s = spinner();
  let started: { port: string; dashPort: string; publicUrl?: string };
  let provisionToken: string | undefined;
  if (method === "compose") {
    log.step(
      sourceBuildDir()
        ? "Building the Vibrail images from your source checkout (first run takes a few minutes)…"
        : "Pulling images and starting the Docker Compose stack…",
    );
    const up = composeUp({ publicUrl, trustProxy: behindProxy, version: __CLI_VERSION__ });
    if (!up.ok) {
      log.error("The Docker Compose stack didn't come up. Run `vibrail up --compose` to see the error.");
      process.exit(1);
    }
    started = { port: up.apiPort, dashPort: up.dashPort, publicUrl };
    provisionToken = composeInternalToken() ?? undefined;
    s.start("Waiting for the Vibrail API");
  } else {
    s.start("Installing Vibrail as a service");
    try {
      started = await startService(
        { publicUrl, trustProxy: behindProxy, uiVersion: uiTag },
        { quiet: true },
      );
    } catch (e) {
      s.stop("Couldn't install the service.", 1);
      log.error((e as Error).message);
      log.info("Run `vibrail up --foreground` to run it attached and see the error.");
      process.exit(1);
    }
    s.message("Waiting for the Vibrail API");
  }

  if (!(await waitHealthy(started.port))) {
    s.stop("Vibrail didn't become healthy in time.", 1);
    const reason = lastServiceError();
    if (reason) log.error(reason);
    if (reason && /lock/i.test(reason)) {
      log.info("The database is locked by another instance — run `vibrail stop`, then re-run `vibrail`.");
    } else {
      log.info(
        method === "compose"
          ? "Run `vibrail up --compose` to see the error."
          : "Run `vibrail up --foreground` to run it attached and see the error.",
      );
    }
    process.exit(1);
  }

  if (method === "compose") {
    // Reuse the SAME provision pipe as `vibrail up` (admin + domain via
    // self-register against the running stack). Keep the interactive Vibrail
    // Cloud connect for a free domain; the container edge owns HTTPS.
    s.message("Starting the Vibrail dashboard");
    await waitDashboard(started.dashPort);
    s.stop("Deployed.");

    let liveUrl = publicUrl ?? `http://localhost:${started.dashPort}`;
    if (domainPlan.type === "free") {
      const cloud = await connectVibrailCloud(started.port, provisionToken);
      if (cloud) cloudEmail = cloud.email;
      else
        log.warn(
          "Vibrail Cloud wasn't connected — skipping the free domain. Your local admin login still works; add it later in Settings → Cloud.",
        );
    }
    const result = await headlessProvision({
      port: started.port,
      dashPort: started.dashPort,
      inputs: wizardInputs(admin, domainPlan),
      token: provisionToken,
      method: "compose",
      onLog: (msg) => log.message(chalk.dim(msg)),
    });
    if (result.liveUrl) liveUrl = result.liveUrl;
    for (const w of result.warnings) log.warn(w);
    finishSetup({
      liveUrl,
      dashPort: started.dashPort,
      apiPort: started.port,
      adminEmail: admin.email,
      cloudEmail,
      method: "compose",
      byo: domainPlan.type === "byo",
    });
    return;
  }

  // Always create the local admin now — before any cloud connect — so the instance
  // login is the email + password you set, never derived from Vibrail Cloud.
  s.message("Creating your admin account");
  const adminRes = await bootstrapAdmin(started.port, admin);
  if (!adminRes.ok) {
    s.stop(`Couldn't create the admin account: ${adminRes.message}`, 1);
    process.exit(1);
  }
  if (adminRes.message === "already-exists") {
    // This data dir already had an admin (a re-run, or a prior cloud/dirty setup).
    // bootstrap-admin is one-shot and won't touch it, so force the box to LOCAL
    // login with the credentials just entered — reset sets the password, revokes
    // stale sessions, and flips authMode back to local. Without this, a box that
    // was previously cloud-linked keeps showing "Sign in with Vibrail" instead of
    // the email + password form.
    s.message("Applying your admin login");
    const rr = await internalPost(started.port, "/api/system/reset-admin-password", {
      email: admin.email,
      name: admin.name,
      password: admin.password,
    });
    if (!rr.ok) {
      s.stop(`Couldn't set your admin login: ${rr.data?.error || "failed"}`, 1);
      process.exit(1);
    }
  }
  s.message(`Admin ready for ${admin.email}`);

  // The dist is already cached, so the dashboard only has to boot. Wait for it so
  // "live" is truthful (best-effort — the API already serves regardless).
  s.message("Starting the Vibrail dashboard");
  await waitDashboard(started.dashPort);
  s.stop("Deployed.");

  // 4. Register the control plane as an app + attach its domain (reuse Vibrail's
  //    own app + domain pipeline). Runs for every mode so it shows under Apps.
  let liveUrl = publicUrl ?? `http://localhost:${started.dashPort}`;
  const port = started.port;

  if (domainPlan.type === "free") {
    // Connect Vibrail Cloud — a SEPARATE step from login. Authorize in the browser
    // (link printed on the terminal); it only attaches the free .vibrail.app domain +
    // mail. The backend links it to the local admin already created above WITHOUT
    // changing the login method. If declined, the box still works on your local
    // login — we just skip the free domain.
    const cloud = await connectVibrailCloud(port);
    if (!cloud) {
      log.warn("Vibrail Cloud wasn't connected — skipping the free domain. Your local admin login still works; add the domain later in Settings → Cloud.");
      await internalPost(port, "/api/system/self-register", { domainType: "byo" });
    } else {
      cloudEmail = cloud.email;
      // Availability is only knowable now (cloud is connected) — so surface it
      // here: on a taken/invalid subdomain, re-prompt and retry instead of
      // dead-ending. The public host is guaranteed set (resolvePublicHost).
      let regSlug = domainPlan.slug;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const s2 = spinner();
        s2.start(`Registering ${chalk.bold(`${regSlug}.${SYSTEM.DOMAINS.CLOUD_DOMAIN}`)} with Vibrail Cloud`);
        const res = await internalPost(port, "/api/system/self-register", {
          domainType: "free",
          slug: regSlug,
          publicHost: domainPlan.publicHost,
          dashPort: Number(started.dashPort),
        });
        if (res.ok && res.data?.url) {
          liveUrl = res.data.url;
          s2.stop(`Free domain live: ${res.data.url}`);
          break;
        }
        s2.stop(`Couldn't register ${regSlug}.${SYSTEM.DOMAINS.CLOUD_DOMAIN}: ${res.data?.error || "failed"}`, 1);
        const next = ensure(
          await select({
            message: "Try a different subdomain?",
            options: [
              { value: "retry", label: "Pick another subdomain" },
              { value: "skip", label: "Skip for now", hint: "log in on this server; add a domain later in Settings → Cloud" },
            ],
          }),
        );
        if (next === "skip") break;
        regSlug = ensure(
          await text({
            message: "Choose your subdomain",
            placeholder: "my-vibrail",
            initialValue: regSlug,
            validate: (v) => (v && SLUG_RE.test(v.trim().toLowerCase()) ? undefined : "Lowercase letters, digits, hyphens"),
          }),
        )
          .trim()
          .toLowerCase();
      }
    }
  } else if (domainPlan.type === "byo") {
    const res = await internalPost(port, "/api/system/self-register", {
      domainType: "byo",
      hostname: domainPlan.hostname,
    });
    if (res.ok && res.data?.url) liveUrl = res.data.url;
  } else {
    // Private — still register as an app so it appears under Apps.
    await internalPost(port, "/api/system/self-register", { domainType: "byo" });
  }

  finishSetup({
    liveUrl,
    dashPort: started.dashPort,
    apiPort: started.port,
    adminEmail: admin.email,
    cloudEmail,
    method: "bare",
    byo: domainPlan.type === "byo",
  });
}

/** The resolved API/dashboard ports the service last used. */
function storedPorts(): { api?: number; dashboard?: number } {
  const p = join(OS_DIR, "ports.json");
  try {
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
  } catch {
    return {};
  }
}

/**
 * Control panel for an ALREADY-SET-UP box — what bare `vibrail` shows instead of
 * re-running setup once a service is installed. Manage the running instance
 * (open / status / start-stop-restart / reset login / reconfigure) rather than
 * starting over.
 */
export async function runControl(): Promise<void> {
  const svc = serviceStatus();
  const ports = storedPorts();
  const apiPort = String(ports.api ?? 4000);
  const dashUrl = `http://localhost:${ports.dashboard ?? 3001}`;
  const publicUrl = readInstanceUrl();
  // The real front door: the public domain if one was set, else the local dashboard.
  const primaryUrl = publicUrl && !/^https?:\/\/localhost/i.test(publicUrl) ? publicUrl : dashUrl;

  intro(`${chalk.bgCyan(chalk.black(" Vibrail "))}${chalk.dim(" control")}`);
  note(
    `${chalk.dim("URL".padEnd(11))}${chalk.bold(primaryUrl)}\n` +
      `${chalk.dim("Service".padEnd(11))}${svc.running ? chalk.green("running") : chalk.yellow("stopped")}\n` +
      `${chalk.dim("Dashboard".padEnd(11))}${dashUrl}\n` +
      (ports.api ? `${chalk.dim("API".padEnd(11))}http://localhost:${ports.api}\n` : "") +
      `${chalk.dim("Manager".padEnd(11))}${svc.kind === "unsupported" ? "none" : svc.kind}`,
    "Vibrail is already set up",
  );

  // Crash-looping on a corrupt DB is the one case where "Start" won't help —
  // surface Repair first and say so, instead of leaving the user guessing.
  const corrupted = looksCorrupted();
  if (corrupted) {
    note(chalk.red("The service is installed but keeps failing to start — the database looks corrupted."), "Needs repair");
  }

  const action = ensure(
    await select({
      message: "What would you like to do?",
      options: [
        ...(corrupted ? [{ value: "repair", label: "Repair database", hint: "backup → heal → verify" }] : []),
        { value: "open", label: "Open the dashboard" },
        svc.running
          ? { value: "restart", label: "Restart the service" }
          : { value: "start", label: "Start the service" },
        { value: "stop", label: "Stop the service", hint: "won't restart on boot" },
        ...(corrupted ? [] : [{ value: "repair", label: "Repair database", hint: "backup → heal a corrupt DB" }]),
        { value: "reset", label: "Reset admin password", hint: "sets a local email + password login" },
        { value: "reconfigure", label: "Re-run setup", hint: "reconfigure domain / cloud / admin" },
        { value: "quit", label: "Quit" },
      ],
    }),
  );

  switch (action) {
    case "repair": {
      const res = await runRepair();
      outro(res.healed ? chalk.green(res.detail) : chalk.yellow(res.detail));
      return;
    }
    case "open":
      await open(primaryUrl).catch(() => {});
      outro(chalk.dim(`Opening ${primaryUrl}`));
      return;
    case "start":
      await startService({});
      return;
    case "restart": {
      const r = restartService();
      outro(r.restarted ? chalk.green("Restarted.") : chalk.yellow(r.detail));
      return;
    }
    case "stop": {
      const r = stopService();
      outro(chalk.green(`Stopped. ${chalk.dim(r.detail)}`));
      return;
    }
    case "reset": {
      const pw = ensure(
        await password({ message: "New admin password", validate: (v) => (v && v.length >= 8 ? undefined : "At least 8 characters") }),
      );
      const rr = await internalPost(apiPort, "/api/system/reset-admin-password", { password: pw });
      outro(
        rr.ok
          ? chalk.green(`Password reset. Sign in at ${dashUrl} with your email + new password.`)
          : chalk.red(`Couldn't reset: ${rr.data?.error || "failed"}`),
      );
      return;
    }
    case "reconfigure":
      await runWizard();
      return;
    default:
      outro(chalk.dim("Nothing changed."));
  }
}
