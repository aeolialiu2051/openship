import net from "node:net";
import type { Duplex } from "node:stream";

import type { ClientChannel } from "ssh2";

import {
  connectSshClient,
  execSshCommand,
  openSshUnixSocket,
  type StreamLocalCapableClient,
} from "../system/ssh-client";
import type { SshConfig, CommandExecutor } from "../types";
import type { DockerConnectionOptions } from "./docker-transport";
import { safeErrorMessage } from "@repo/core";

const DEFAULT_REMOTE_DOCKER_SOCKET_PATH = "/var/run/docker.sock";
const resolvedDockerSocketPathCache = new WeakMap<DockerConnectionOptions, Promise<string>>();

function toSshConfig(opts: DockerConnectionOptions): SshConfig {
  return {
    host: opts.host ?? "",
    port: opts.port ?? 22,
    username: opts.username,
    hostVerifier: opts.hostVerifier,
    password: opts.password,
    privateKey: opts.privateKey,
    privateKeyPassphrase: opts.privateKeyPassphrase,
    sshAgent: opts.sshAgent,
    useSystemSsh: opts.useSystemSsh,
    sshJumpHost: opts.sshJumpHost,
    sshArgs: opts.sshArgs,
  };
}

function getConfiguredDockerSocketPath(opts: DockerConnectionOptions): string | null {
  const socketPath = opts.dockerSocketPath?.trim();
  return socketPath ? socketPath : null;
}

function getFallbackDockerSocketPath(opts: DockerConnectionOptions): string {
  return getConfiguredDockerSocketPath(opts) ?? DEFAULT_REMOTE_DOCKER_SOCKET_PATH;
}

function normalizeSocketPathLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const line of lines) {
    const socketPath = line.trim();
    if (!socketPath.startsWith("/")) {
      continue;
    }
    if (seen.has(socketPath)) {
      continue;
    }
    seen.add(socketPath);
    normalized.push(socketPath);
  }

  return normalized;
}

const DOCKER_SOCKET_DISCOVERY_SCRIPT = [
  "set -eu",
  'uid="$(id -u 2>/dev/null || printf 0)"',
  'printf "%s\\n" "/var/run/docker.sock" "/run/docker.sock" "/run/podman/podman.sock" "/run/user/$uid/docker.sock" "$HOME/.docker/run/docker.sock" | while IFS= read -r candidate; do if [ -S "$candidate" ]; then printf "%s\\n" "$candidate"; fi; done',
  'find /run/user -maxdepth 2 -type s \\( -name docker.sock -o -name podman.sock \\) -print 2>/dev/null || true',
  'for dir in /run /var/run "$HOME/.docker/run"; do',
  '  if [ -d "$dir" ]; then',
  '    find "$dir" -maxdepth 3 -type s \\( -name docker.sock -o -name podman.sock \\) -print 2>/dev/null || true',
  "  fi",
  "done",
].join("\n");

async function discoverRemoteDockerSocketPathsWithClient(
  client: StreamLocalCapableClient,
): Promise<string[]> {
  const result = await execSshCommand(client, DOCKER_SOCKET_DISCOVERY_SCRIPT);
  const lines = [result.stdout, result.stderr]
    .filter(Boolean)
    .flatMap((text) => text.split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean);

  return normalizeSocketPathLines(lines);
}

async function discoverRemoteDockerSocketPathsWithExecutor(
  executor: CommandExecutor,
): Promise<string[]> {
  try {
    const output = await executor.exec(DOCKER_SOCKET_DISCOVERY_SCRIPT, { timeout: 10_000 });
    return normalizeSocketPathLines(output.split(/\r?\n/));
  } catch {
    return [];
  }
}

async function discoverRemoteDockerSocketPaths(
  opts: DockerConnectionOptions,
): Promise<string[]> {
  // Use pooled executor when available - no extra SSH connection needed
  if (opts.executor) {
    return discoverRemoteDockerSocketPathsWithExecutor(opts.executor);
  }

  let conn: StreamLocalCapableClient | null = null;

  try {
    conn = await connectSshClient(toSshConfig(opts));
    return await discoverRemoteDockerSocketPathsWithClient(conn);
  } finally {
    conn?.end();
  }
}

/**
 * Resolve the exact remote socket used by the Docker API bridge.
 *
 * Native Docker CLI operations performed over the same SSH executor must use
 * this path explicitly as well. Otherwise the CLI may honor a rootless/custom
 * Docker context while dockerode is connected to /var/run/docker.sock, causing
 * a successful build to be invisible to the subsequent API inspect/deploy.
 */
export async function resolveRemoteDockerSocketPath(
  opts: DockerConnectionOptions,
): Promise<string> {
  const configuredSocketPath = getConfiguredDockerSocketPath(opts);
  if (configuredSocketPath) {
    return configuredSocketPath;
  }

  const cachedPath = resolvedDockerSocketPathCache.get(opts);
  if (cachedPath) {
    return cachedPath;
  }

  const pendingPath = discoverRemoteDockerSocketPaths(opts)
    .then((paths) => paths[0] ?? DEFAULT_REMOTE_DOCKER_SOCKET_PATH)
    .catch(() => DEFAULT_REMOTE_DOCKER_SOCKET_PATH);

  resolvedDockerSocketPathCache.set(opts, pendingPath);
  return pendingPath;
}

function shouldCollectSocketDiagnostics(error: unknown): boolean {
  const message = safeErrorMessage(error);
  return /channel open failure|open failed/i.test(message);
}

function formatSocketDiagnostics(lines: string[]): string {
  if (lines.length === 0) {
    return "";
  }

  return ` Remote diagnostics: ${lines.join("; ")}.`;
}

async function collectDockerSocketDiagnostics(
  opts: DockerConnectionOptions,
  socketPath: string,
): Promise<string[]> {
  let conn: StreamLocalCapableClient | null = null;

  try {
    conn = await connectSshClient(toSshConfig(opts));

    const escapedPath = JSON.stringify(socketPath);
    const command = [
      "set -eu",
      'printf "user=%s\\n" "$(whoami)"',
      'printf "groups=%s\\n" "$(id -Gn 2>/dev/null || true)"',
      `if [ -S ${escapedPath} ]; then`,
      `  printf 'socket=yes path=%s\\n' ${escapedPath}`,
      `  ls -ld ${escapedPath}`,
      "else",
      `  printf 'socket=no path=%s\\n' ${escapedPath}`,
      `  if [ -e ${escapedPath} ]; then ls -ld ${escapedPath}; fi`,
      "fi",
    ].join("\n");

    const result = await execSshCommand(conn, command);
    const lines = [result.stdout, result.stderr]
      .filter(Boolean)
      .flatMap((text) => text.split(/\r?\n/))
      .map((line) => line.trim())
      .filter(Boolean);

    if (result.code !== 0 && lines.length === 0) {
      return [`remote diagnostic exited with code ${result.code}`];
    }

    if (!getConfiguredDockerSocketPath(opts)) {
      const discoveredPaths = await discoverRemoteDockerSocketPathsWithClient(conn).catch(() => []);
      lines.push(
        discoveredPaths.length > 0
          ? `discovered_sockets=${discoveredPaths.join(",")}`
          : "discovered_sockets=none",
      );
    }

    return lines;
  } catch (error) {
    return [
      `remote diagnostic failed: ${safeErrorMessage(error)}`,
    ];
  } finally {
    conn?.end();
  }
}

export async function probeDockerSshBridge(opts: DockerConnectionOptions): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let conn: StreamLocalCapableClient | null = null;

    resolveRemoteDockerSocketPath(opts)
      .then((socketPath) =>
        connectSshClient(toSshConfig(opts)).then((client) => ({ client, socketPath })),
      )
      .then(async ({ client, socketPath }) => {
        conn = client;
        let stream: ClientChannel;

        try {
          stream = await openSshUnixSocket(client, socketPath);
        } catch (error) {
          throw new Error(
            `SSH session established, but opening a streamlocal channel to ${socketPath} failed: ${safeErrorMessage(error)}`,
          );
        }

        stream.once("close", () => {
          client.end();
        });
        stream.end();
        resolve();
      })
      .catch((error) => {
        conn?.end();
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
}

/** Send a real Docker Engine request through a candidate relay. Opening an SSH
 * channel alone is not sufficient: OpenSSH can accept the local side while the
 * remote StreamLocal connection is stalled or unusable. */
async function probeDockerApiStream(stream: Duplex): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let response = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stream.destroy();
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new Error("Docker API relay opened but did not answer GET /_ping within 5s")),
      5_000,
    );
    timer.unref?.();

    stream.on("data", (chunk: Buffer | string) => {
      response += chunk.toString();
      const headerEnd = response.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      if (!/^HTTP\/1\.[01] 200\b/.test(response)) {
        finish(
          new Error(`Docker API relay returned an unexpected response: ${response.slice(0, 200)}`),
        );
        return;
      }
      const body = response.slice(headerEnd + 4).trim();
      if (body.startsWith("OK")) finish();
    });
    stream.once("error", (error) => finish(error));
    stream.once("close", () => {
      if (!settled) finish(new Error("Docker API relay closed before answering GET /_ping"));
    });
    stream.write("GET /_ping HTTP/1.1\r\nHost: docker\r\nConnection: close\r\n\r\n");
  });
}

export async function verifyDockerSshBridge(opts: DockerConnectionOptions): Promise<void> {
  const socketPath = await resolveRemoteDockerSocketPath(opts).catch(() => getFallbackDockerSocketPath(opts));

  // Exercise the exact upstream mechanism used by the loopback bridge. Merely
  // opening an SSH channel is insufficient: the Docker CLI relay must answer a
  // real Engine API request.
  try {
    const stream = await openDockerUpstream(opts);
    await probeDockerApiStream(stream);
  } catch (error) {
    const diagnostics = shouldCollectSocketDiagnostics(error)
      ? formatSocketDiagnostics(await collectDockerSocketDiagnostics(opts, socketPath))
      : "";

    throw new Error(
      `Cannot reach Docker daemon through the dedicated SSH relay: ${safeErrorMessage(error)}. ` +
        `Resolved socket: ${socketPath}. Check that Docker is running and the SSH user can access that socket.` +
        diagnostics,
      { cause: error },
    );
  }
}

/** A loopback TCP listener that relays Docker API traffic over SSH. */
export interface DockerSshBridge {
  /** Bind the listener and return the loopback address dockerode should target. */
  start(): Promise<{ host: string; port: number }>;
  /**
   * Drop active proxied connections while keeping the loopback listener alive.
   * Resolves only after every local socket has emitted `close`, so HTTP agents
   * have removed those sockets from their keep-alive pools before the caller
   * starts another Docker API request.
   */
  resetConnections(): Promise<void>;
  /** Tear down the listener and any live connections. */
  close(): Promise<void>;
}

/**
 * Open a duplex stream to the remote Docker API.
 *
 * Password/private-key transports deliberately open a DEDICATED SSH
 * connection for Docker. Sharing the pooled management connection made a
 * long-running build, SFTP, routing and Docker HTTP keep-alives compete for
 * sshd's per-connection MaxSessions quota. Agent/keychain auth still goes
 * through the system-ssh executor, whose forwardDockerSocket implementation
 * starts a non-ControlMaster connection for the same isolation boundary.
 */
async function openDockerUpstream(opts: DockerConnectionOptions): Promise<Duplex> {
  const socketPath = await resolveRemoteDockerSocketPath(opts);

  if (opts.executor?.forwardDockerSocket) {
    return opts.executor.forwardDockerSocket(socketPath);
  }

  const client: StreamLocalCapableClient = await connectSshClient(toSshConfig(opts));
  try {
    const command = `docker --host ${JSON.stringify(`unix://${socketPath}`)} system dial-stdio`;
    const channel = await new Promise<ClientChannel>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        finish(() => {
          client.end();
          reject(new Error("Timed out opening the dedicated Docker SSH relay"));
        });
      }, 15_000);
      timer.unref?.();
      client.exec(command, (error, stream) => {
        if (settled) {
          try { stream?.close(); } catch { /* connection already ended */ }
          return;
        }
        if (error) finish(() => reject(error));
        else finish(() => resolve(stream));
      });
    });
    channel.once("close", () => client.end());
    channel.on("error", () => client.end());
    return channel;
  } catch (error) {
    client.end();
    throw error;
  }
}

/**
 * Build a Docker transport bridge for the SSH connection.
 *
 * dockerode talks plain HTTP to a loopback TCP port; each accepted connection
 * is piped to a dedicated SSH `docker system dial-stdio` relay. This is
 * deliberately a real TCP listener rather than a custom
 * `http.Agent.createConnection` (the previous approach): Bun's HTTP client
 * ignores `Agent.createConnection` and dials the placeholder host instead,
 * which broke every SSH-transport Docker call under the Bun-hosted API. A
 * loopback bridge is honored identically by Node and Bun.
 */
export function createDockerSshBridge(opts: DockerConnectionOptions): DockerSshBridge {
  const clients = new Set<net.Socket>();
  const upstreams = new Set<Duplex>();
  let generation = 0;
  let started = false;
  let closed = false;

  const resetConnections = async () => {
    generation += 1;
    const closing = Array.from(clients, (client) =>
      new Promise<void>((resolve) => {
        // `destroy()` schedules `close`; waiting for it matters because
        // dockerode's HTTP agent removes the socket from its reusable pool in
        // that event. Returning synchronously lets the next request race with
        // the stale pooled socket and fail with "socket connection was closed
        // unexpectedly".
        client.once("close", resolve);
        client.destroy();
      }),
    );
    for (const upstream of upstreams) upstream.destroy();
    await Promise.all(closing);
  };

  const server = net.createServer((client) => {
    const acceptedGeneration = generation;
    clients.add(client);
    client.setNoDelay(true);
    client.once("close", () => clients.delete(client));

    openDockerUpstream(opts)
      .then((upstream) => {
        // resetConnections()/close() may have run while SSH authentication or
        // channel creation was pending. Never attach that late upstream to the
        // next transport generation; close it immediately instead.
        if (closed || client.destroyed || acceptedGeneration !== generation) {
          upstream.destroy();
          client.destroy();
          return;
        }
        upstreams.add(upstream);
        upstream.once("close", () => upstreams.delete(upstream));
        const teardown = () => {
          client.destroy();
          upstream.destroy();
        };
        client.on("error", teardown);
        upstream.on("error", teardown);
        client.once("close", () => upstream.destroy());
        upstream.once("close", () => client.destroy());
        client.pipe(upstream);
        upstream.pipe(client);
      })
      .catch((error) => {
        client.destroy(error instanceof Error ? error : new Error(String(error)));
      });
  });

  return {
    start: () =>
      new Promise((resolve, reject) => {
        if (closed) {
          reject(new Error("Docker SSH bridge has already been closed."));
          return;
        }
        if (started) {
          reject(new Error("Docker SSH bridge has already been started."));
          return;
        }
        started = true;
        const onError = (error: Error) => reject(error);
        server.once("error", onError);
        // Loopback only — never expose the remote Docker socket on the network.
        server.listen(0, "127.0.0.1", () => {
          server.removeListener("error", onError);
          const address = server.address();
          if (address === null || typeof address === "string") {
            reject(new Error("Docker SSH bridge failed to bind a loopback TCP port."));
            return;
          }
          resolve({ host: "127.0.0.1", port: address.port });
        });
      }),
    resetConnections,
    close: async () => {
      if (closed) return;
      closed = true;
      await resetConnections();
      if (!started || !server.listening) return;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if ((error as NodeJS.ErrnoException | undefined)?.code === "ERR_SERVER_NOT_RUNNING") {
            resolve();
          } else if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
}
