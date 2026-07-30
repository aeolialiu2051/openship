/**
 * Edge preflight — who owns ports 80/443 before we install legacy edge.
 *
 * Both install paths (CLI self-install and dashboard/SSH server setup) run this
 * over a CommandExecutor (local or SSH) before binding the edge ports, so we
 * never confuse an existing reverse proxy with an Openship-managed service.
 * Detection is read-only.
 */

import type { CommandExecutor } from "../../types";
import {
  describeProcess as probeProcess,
  probeListeningPort,
  type PortOccupant,
} from "../../runtime/port-conflict";
import type {
  EdgeOccupant,
  EdgeStatus,
  ProxyKind,
} from "../types";

const EDGE_PORTS = [80, 443] as const;

async function tryExec(executor: CommandExecutor, command: string): Promise<string | null> {
  try {
    return await executor.exec(command);
  } catch {
    return null;
  }
}

/** Classify a proxy from an image/command/unit string. Exported so the Docker
 *  migration scan can flag a containerized reverse proxy (traefik/nginx/…). */
export function classifyProxy(text: string | undefined): ProxyKind | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (/(^|[\s/:])nginx/.test(t)) return "nginx";
  if (/(^|[\s/:])caddy/.test(t)) return "caddy";
  if (/(apache2|httpd)/.test(t)) return "apache";
  if (/(^|[\s/:])traefik/.test(t)) return "traefik";
  if (/(^|[\s/:])haproxy/.test(t)) return "haproxy";
  return undefined;
}

async function detectDockerOnPort(
  executor: CommandExecutor,
  port: number,
): Promise<{ name: string; image: string } | null> {
  const out = await tryExec(
    executor,
    `docker ps --filter publish=${port} --format '{{.Names}}\t{{.Image}}' 2>/dev/null | head -1`,
  );
  const line = out?.trim();
  if (!line) return null;
  const [name, image] = line.split("\t");
  if (!name) return null;
  return { name, image: image ?? "" };
}

/** `nginx: worker process` (the child that shows
 *  up in `ss` because it inherited the listening fd). */
const WORKER_RE = /\bnginx\s*:\s*worker process/i;
const MASTER_RE = /\bnginx\s*:\s*master process/i;

/**
 * `ss` reports whichever nginx process holds the listening fd — usually a WORKER,
 * because workers inherit it from the master. Stopping a worker frees nothing:
 * the master still owns :80/:443 and immediately respawns it, so the takeover
 * "succeeds" and the edge then fails to bind (the hekai symptom). Walk one hop up
 * to the master when the listener is a worker, and re-resolve the systemd unit
 * from the master's own cgroup.
 *
 * Deliberately narrow: only a worker→master hop, only when the parent really is
 * the matching master. Never a blind PPid walk — that would climb to systemd
 * (PID 1) for a service-started process.
 */
async function resolveProxyMaster(
  executor: CommandExecutor,
  listener: PortOccupant | null,
): Promise<PortOccupant | null> {
  if (!listener?.pid) return listener;
  if (!WORKER_RE.test(`${listener.rawCommand ?? ""} ${listener.command ?? ""}`)) return listener;

  const ppidRaw = await tryExec(
    executor,
    `awk '/^PPid:/{print $2}' /proc/${listener.pid}/status 2>/dev/null || true`,
  );
  const ppid = Number.parseInt((ppidRaw ?? "").trim(), 10);
  if (!Number.isInteger(ppid) || ppid <= 1) return listener;

  const master = await probeProcess(executor, ppid);
  if (!master || !MASTER_RE.test(`${master.rawCommand ?? ""} ${master.command ?? ""}`)) {
    return listener;
  }
  return master;
}

async function probeEdgePort(
  executor: CommandExecutor,
  port: number,
): Promise<EdgeOccupant | null> {
  const listener = await resolveProxyMaster(executor, await probeListeningPort(executor, port));
  const docker = await detectDockerOnPort(executor, port);
  if (!listener && !docker) return null;

  const proxy = classifyProxy(
    [
      docker?.image,
      docker?.name,
      listener?.rawCommand,
      listener?.command,
      listener?.systemdUnit,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return {
    port,
    pid: listener?.pid ?? undefined,
    command: docker
      ? `docker container ${docker.name} (${docker.image})`
      : listener?.command,
    rawCommand: listener?.rawCommand,
    systemdUnit: listener?.systemdUnit,
    systemdDescription: listener?.systemdDescription,
    isDocker: Boolean(docker),
    containerName: docker?.name,
    proxy,
  };
}

/** Detect and classify what owns ports 80/443. Read-only. */
export async function probeEdge(executor: CommandExecutor): Promise<EdgeStatus> {
  const all: EdgeOccupant[] = [];
  for (const port of EDGE_PORTS) {
    const occ = await probeEdgePort(executor, port);
    if (occ) all.push(occ);
  }

  let classification: EdgeStatus["classification"];
  if (all.length === 0) classification = "free";
  else if (all.every((o) => o.proxy)) classification = "known";
  else classification = "unknown";

  return {
    classification,
    occupants: all,
    canProceedClean: classification === "free",
  };
}
