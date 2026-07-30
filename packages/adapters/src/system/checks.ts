/**
 * Component health checks - detect installed binaries and running services.
 *
 * All checks run through a CommandExecutor, so they work both locally
 * and on remote servers via SSH. Checks are fast, non-destructive, and
 * safe to run repeatedly.
 *
 * In normal operation, checks run ONCE during setup - the result is
 * cached in SetupStateStore. Subsequent operations read cached state
 * instead of re-running checks (see setup.ts).
 */

import type { CommandExecutor } from "../types";
import type { ComponentStatus } from "./types";
import { systemCatalog } from "./catalog";
import { elevatedExecutor } from "./elevated-executor";
import { resolveEnvironment } from "./environment";
import { enrichAvailableVersions } from "./available-version";
import { getSystemComponentDefinition, SYSTEM_COMPONENTS } from "./components";
import { formatDuration, systemDebug } from "./debug";
import { isRemoteConnectionError } from "./errors";
import { safeErrorMessage } from "@repo/core";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Run a command via executor, return stdout or null on failure. */
async function tryExec(
  executor: CommandExecutor,
  command: string,
): Promise<string | null> {
  const startedAt = Date.now();
  systemDebug("checks", `exec:start ${command}`);
  try {
    const result = await executor.exec(command, { timeout: 10_000 });
    systemDebug(
      "checks",
      `exec:ok ${command} (${formatDuration(startedAt)})`,
    );
    return result;
  } catch (err) {
    if (isRemoteConnectionError(err)) {
      systemDebug(
        "checks",
        `exec:abort ${command} (${formatDuration(startedAt)}) ${safeErrorMessage(err)}`,
      );
      throw err;
    }
    const msg = safeErrorMessage(err);
    systemDebug(
      "checks",
      `exec:fail ${command} (${formatDuration(startedAt)}) ${msg}`,
    );
    return null;
  }
}
function healthy(
  name: string,
  version: string,
  running?: boolean,
): ComponentStatus {
  const component = getSystemComponentDefinition(name);
  return {
    name,
    label: component.label,
    description: component.description,
    installable: component.installable,
    installed: true,
    version,
    running,
    healthy: running !== undefined ? running : true,
    message: running
      ? `${name} ${version} - running`
      : `${name} ${version} - installed`,
  };
}

function unhealthy(
  name: string,
  message: string,
  opts?: { version?: string; running?: boolean },
): ComponentStatus {
  const component = getSystemComponentDefinition(name);
  return {
    name,
    label: component.label,
    description: component.description,
    installable: component.installable,
    installed: !!opts?.version,
    version: opts?.version,
    running: opts?.running,
    healthy: false,
    message,
  };
}

// ─── Individual checks ──────────────────────────────────────────────────────

export async function checkDocker(
  executor: CommandExecutor,
): Promise<ComponentStatus> {
  const startedAt = Date.now();
  const recipe = systemCatalog.checks.docker;
  const version = await tryExec(executor, recipe.versionCommand);
  if (!version) {
    systemDebug("checks", `docker:missing (${formatDuration(startedAt)})`);
    return unhealthy("docker", recipe.missingMessage);
  }

  const parsed = recipe.parseVersion(version);

  const info = await tryExec(executor, recipe.daemonCommand!);
  if (!info) {
    // The daemon may be healthy while the login user lacks access to
    // /var/run/docker.sock. Probe once with passwordless sudo so we can report
    // the real problem instead of incorrectly claiming dockerd is stopped.
    const profile = await resolveEnvironment(executor);
    if (!profile.isRoot && profile.canSudo) {
      const elevatedInfo = await tryExec(
        elevatedExecutor(executor),
        recipe.daemonCommand!,
      );
      if (elevatedInfo) {
        systemDebug("checks", `docker:permission-denied (${formatDuration(startedAt)})`);
        return unhealthy("docker", recipe.permissionMessage!, {
          version: parsed,
          running: true,
        });
      }
    }

    systemDebug("checks", `docker:not-running (${formatDuration(startedAt)})`);
    return unhealthy("docker", recipe.notRunningMessage!, {
      version: parsed,
      running: false,
    });
  }

  systemDebug("checks", `docker:healthy (${formatDuration(startedAt)})`);
  return healthy("docker", parsed, true);
}

export async function checkGit(
  executor: CommandExecutor,
): Promise<ComponentStatus> {
  const startedAt = Date.now();
  const recipe = systemCatalog.checks.git;
  const version = await tryExec(executor, recipe.versionCommand);
  if (!version) {
    systemDebug("checks", `git:missing (${formatDuration(startedAt)})`);
    return unhealthy("git", recipe.missingMessage);
  }
  const parsed = recipe.parseVersion(version);
  systemDebug("checks", `git:healthy (${formatDuration(startedAt)})`);
  return healthy("git", parsed);
}

export async function checkRsync(
  executor: CommandExecutor,
): Promise<ComponentStatus> {
  const startedAt = Date.now();
  const recipe = systemCatalog.checks.rsync;
  const version = await tryExec(executor, recipe.versionCommand);
  if (!version) {
    systemDebug("checks", `rsync:missing (${formatDuration(startedAt)})`);
    return unhealthy("rsync", recipe.missingMessage);
  }
  const parsed = recipe.parseVersion(version);
  systemDebug("checks", `rsync:healthy (${formatDuration(startedAt)})`);
  return healthy("rsync", parsed);
}

export async function checkCertbot(
  executor: CommandExecutor,
): Promise<ComponentStatus> {
  const startedAt = Date.now();
  const recipe = systemCatalog.checks.certbot;
  const version = await tryExec(executor, recipe.versionCommand);
  if (!version) {
    systemDebug("checks", `certbot:missing (${formatDuration(startedAt)})`);
    return unhealthy("certbot", recipe.missingMessage);
  }
  const parsed = recipe.parseVersion(version);
  systemDebug("checks", `certbot:healthy (${formatDuration(startedAt)})`);
  return healthy("certbot", parsed);
}

interface TraefikProbe {
  installed: boolean;
  running: boolean;
  version?: string;
}

async function probeTraefik(executor: CommandExecutor): Promise<TraefikProbe> {
  const command =
    "docker ps -a --format '{{.Names}}|{{.Image}}|{{.State}}' 2>/dev/null | " +
    "awk -F'|' '$1 == \"vibrail-edge\" || $2 ~ /(^|\\/)traefik([:@]|$)/ { print; exit }'";
  let commandExecutor = executor;
  let output = await tryExec(commandExecutor, command);
  if (output === null) {
    const profile = await resolveEnvironment(executor);
    if (!profile.isRoot && profile.canSudo) {
      commandExecutor = elevatedExecutor(executor);
      output = await tryExec(commandExecutor, command);
    }
  }

  const line = output?.trim();
  if (!line) return { installed: false, running: false };

  const [containerName = "", image = "", state = ""] = line.split("|");
  const versionMatch = /(?:^|\/)traefik:v?([^@]+)(?:@.*)?$/i.exec(image.trim());
  let version = versionMatch?.[1];
  if (version && ["latest", "stable"].includes(version.toLowerCase())) version = undefined;
  if (!version && /^[a-zA-Z0-9_.-]+$/.test(containerName)) {
    const versionOutput = await tryExec(
      commandExecutor,
      `docker exec '${containerName}' traefik version 2>/dev/null | ` +
        `awk -F': *' 'tolower($1) == "version" { print $2; exit }'`,
    );
    version = versionOutput?.trim() || undefined;
  }
  return {
    installed: true,
    running: state.trim().toLowerCase() === "running",
    ...(version ? { version } : {}),
  };
}

export async function checkTraefik(
  executor: CommandExecutor,
): Promise<ComponentStatus> {
  const component = getSystemComponentDefinition("traefik");
  const probe = await probeTraefik(executor);
  if (!probe.installed) {
    return {
      ...component,
      installed: false,
      running: false,
      healthy: false,
      message: "Traefik container not found",
    };
  }
  return {
    ...component,
    installed: true,
    ...(probe.version ? { version: probe.version } : {}),
    running: probe.running,
    healthy: probe.running,
    message: probe.running ? "Traefik is running" : "Traefik container is stopped",
  };
}

/** Count certificates currently attached to active routes without returning any
 * certificate or private-key material. The remote shell emits integers only. */
export async function checkSslCertificates(
  executor: CommandExecutor,
): Promise<ComponentStatus> {
  const component = getSystemComponentDefinition("ssl-certificates");
  const readCount = async (command: string): Promise<number | null> => {
    let output = await tryExec(executor, command);
    if (output === null) {
      const profile = await resolveEnvironment(executor);
      if (!profile.isRoot && profile.canSudo) {
        output = await tryExec(elevatedExecutor(executor), command);
      }
    }
    if (output === null) return null;
    const parsed = Number.parseInt(output.trim(), 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
  };

  const certbotCount = await readCount(
    "if [ ! -d /etc/letsencrypt/live ]; then echo 0; " +
      "elif [ ! -r /etc/letsencrypt/live ] || [ ! -x /etc/letsencrypt/live ]; then exit 13; " +
      "elif [ -d /etc/letsencrypt/archive ] && [ ! -x /etc/letsencrypt/archive ]; then exit 13; " +
      "else references=$( " +
      "if command -v nginx >/dev/null 2>&1; then nginx -T 2>/dev/null || exit 13; fi; " +
      "for directory in /etc/apache2/sites-enabled /etc/httpd/conf.d; do " +
      "if [ -d \"$directory\" ]; then [ -r \"$directory\" ] || exit 13; " +
      "find \"$directory\" \\( -type f -o -type l \\) " +
      "-exec grep -h '/etc/letsencrypt/live/.*/fullchain\\.pem' {} + 2>/dev/null || exit 13; fi; done; " +
      "readlink /etc/ssl/certs/iRedMail.crt 2>/dev/null || true " +
      ") || exit 13; printf '%s\\n' \"$references\" | " +
      "grep -o '/etc/letsencrypt/live/[^/[:space:];]*/fullchain\\.pem' | sort -u | " +
      "while IFS= read -r certificate; do [ -f \"$certificate\" ] && echo \"$certificate\"; done | wc -l; fi",
  );

  // Discover Host rules from both Docker labels and bind-mounted Traefik file
  // provider configs, then count only hostnames for which the running proxy is
  // actually serving a matching, non-expired certificate on port 443. This
  // ignores stale acme.json entries and supports pre-existing Traefik installs.
  const traefikCount = await readCount(
    "container_ids=$(docker ps -q 2>/dev/null) || exit 13; labels=''; " +
      "if [ -n \"$container_ids\" ]; then " +
      "labels=$(docker inspect $container_ids --format '{{range $key, $value := .Config.Labels}}{{printf \"%s=%s\\n\" $key $value}}{{end}}' 2>/dev/null) || exit 13; fi; " +
      "traefik_ids=$(docker ps --format '{{.ID}}|{{.Names}}|{{.Image}}' 2>/dev/null | " +
      "awk -F'|' '$2 == \"vibrail-edge\" || $3 ~ /(^|\\/)traefik([:@]|$)/ {print $1}') || exit 13; " +
      "dynamic=''; if [ -n \"$traefik_ids\" ]; then " +
      "mounts=$(docker inspect $traefik_ids --format '{{range .Mounts}}{{if eq .Type \"bind\"}}{{printf \"%s|%s\\n\" .Source .Destination}}{{end}}{{end}}' 2>/dev/null) || exit 13; " +
      "while IFS='|' read -r source destination; do case \"$destination\" in *dynamic*) " +
      "if [ -d \"$source\" ]; then [ -r \"$source\" ] || exit 13; " +
      "content=$(find \"$source\" -type f -maxdepth 3 -exec grep -h 'Host(' {} + 2>/dev/null) || exit 13; " +
      "dynamic=\"$dynamic\\n$content\"; elif [ -f \"$source\" ]; then [ -r \"$source\" ] || exit 13; " +
      "content=$(grep 'Host(' \"$source\" 2>/dev/null) || true; dynamic=\"$dynamic\\n$content\"; fi;; esac; done <<EOF\n$mounts\nEOF\nfi; " +
      "hostnames=$(printf '%s\\n%s\\n' \"$labels\" \"$dynamic\" | grep -o 'Host(`[^`]*`)' | " +
      "sed 's/^Host(`//; s/`)$//' | sort -u); " +
      "if [ -z \"$hostnames\" ]; then echo 0; elif ! command -v openssl >/dev/null 2>&1; then " +
      "printf '%s\\n' \"$hostnames\" | wc -l; else count=0; " +
      "while IFS= read -r hostname; do if printf '\\n' | " +
      "openssl s_client -connect 127.0.0.1:443 -servername \"$hostname\" 2>/dev/null | " +
      "openssl x509 -noout -checkhost \"$hostname\" -checkend 0 >/dev/null 2>&1; then count=$((count + 1)); fi; done <<EOF\n$hostnames\nEOF\n" +
      "echo \"$count\"; fi",
  );

  const knownCounts = [certbotCount, traefikCount].filter(
    (value): value is number => typeof value === "number",
  );
  const count = knownCounts.reduce((total, value) => total + value, 0);
  const sourceCounts: Partial<Record<"traefik" | "certbot", number>> = {};
  if ((traefikCount ?? 0) > 0) sourceCounts.traefik = traefikCount!;
  if ((certbotCount ?? 0) > 0) sourceCounts.certbot = certbotCount!;
  const unreadable = certbotCount === null || traefikCount === null;

  if (count === 0 && unreadable) {
    return {
      ...component,
      installed: false,
      healthy: false,
      message: "Certificate stores could not be read",
      certificateStatus: { state: "unavailable" },
    };
  }

  return {
    ...component,
    installed: count > 0,
    healthy: count > 0,
    message: count > 0 ? `${count} certificate${count === 1 ? "" : "s"} found` : "No certificates found",
    certificateStatus: {
      state: count > 0 ? "present" : "absent",
      count,
      ...(Object.keys(sourceCounts).length > 0 ? { sourceCounts } : {}),
    },
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────

type CheckFn = (executor: CommandExecutor) => Promise<ComponentStatus>;

export const COMPONENT_CHECKS: Record<string, CheckFn> = {
  docker: checkDocker,
  certbot: checkCertbot,
  git: checkGit,
  rsync: checkRsync,
  traefik: checkTraefik,
  "ssl-certificates": checkSslCertificates,
};

/**
 * Map items through `fn` with a bounded concurrency pool, preserving order.
 *
 * Component checks are independent, so we run several at once instead of
 * serially — a big win on the system-ssh path where every `exec` is a separate
 * `ssh` round-trip (serial checks otherwise stack past the client timeout). The
 * cap keeps us well under sshd's per-connection MaxSessions (default 10), which
 * both ssh2 channels and ControlMaster sessions draw from, leaving headroom for
 * the live-metrics stream sharing the same connection.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/** Max component checks to run concurrently (see mapWithConcurrency). */
const CHECK_CONCURRENCY = 4;

/** Run every registered check with bounded concurrency. */
export async function checkAll(
  executor: CommandExecutor,
): Promise<ComponentStatus[]> {
  const startedAt = Date.now();
  const entries = SYSTEM_COMPONENTS
    .map((component) => [component.name, COMPONENT_CHECKS[component.name]] as const)
    .filter((entry): entry is readonly [string, CheckFn] => Boolean(entry[1]));
  systemDebug(
    "checks",
    `checkAll:start [${entries.map(([name]) => name).join(", ")}]`,
  );
  const results = await mapWithConcurrency(entries, CHECK_CONCURRENCY, ([, fn]) =>
    fn(executor),
  );
  await enrichAvailable(executor, results);
  systemDebug("checks", `checkAll:done (${formatDuration(startedAt)})`);
  return results;
}

/** Best-effort "newer version available?" enrichment; never throws. */
async function enrichAvailable(
  executor: CommandExecutor,
  results: ComponentStatus[],
): Promise<void> {
  try {
    const profile = await resolveEnvironment(executor);
    await enrichAvailableVersions(executor, profile, results);
  } catch {
    /* leave components without an available version */
  }
}

/** Run checks for a specific set of components with bounded concurrency. */
export async function checkComponents(
  executor: CommandExecutor,
  names: string[],
): Promise<ComponentStatus[]> {
  const startedAt = Date.now();
  const fns = names
    .map((name) => COMPONENT_CHECKS[name])
    .filter((fn): fn is CheckFn => Boolean(fn));
  systemDebug("checks", `checkComponents:start [${names.join(", ")}]`);
  const results = await mapWithConcurrency(fns, CHECK_CONCURRENCY, (fn) =>
    fn(executor),
  );
  await enrichAvailable(executor, results);
  systemDebug(
    "checks",
    `checkComponents:done [${names.join(", ")}] (${formatDuration(startedAt)})`,
  );
  return results;
}
