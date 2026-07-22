/**
 * Production dashboard front server.
 *
 * Next's App Router proxy can stream ordinary HTTP, but it cannot forward a
 * WebSocket Upgrade. This small front server keeps Next on a loopback port,
 * proxies normal traffic to it, and sends `/_openship/ws/api/*` upgrades
 * directly to INTERNAL_API_URL. Public deployments therefore expose only the
 * dashboard port while terminal sockets still reach the private API.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

const publicPort = Number(process.env.PORT || 3001);
const publicHost = process.env.HOSTNAME || "0.0.0.0";
const nextPort = Number(process.env.OPENSHIP_NEXT_INTERNAL_PORT || publicPort + 1);
const nextOrigin = new URL(`http://127.0.0.1:${nextPort}`);
const apiOrigin = new URL(
  process.env.INTERNAL_API_URL || process.env.OPENSHIP_LOCAL_API_URL || "http://127.0.0.1:4000",
);
const WS_PREFIX = "/_openship/ws/api/";
const nextEntry = process.env.OPENSHIP_NEXT_ENTRY || join(root, "server.js");

const next = spawn(process.execPath, [nextEntry], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(nextPort),
    HOSTNAME: "127.0.0.1",
  },
  stdio: "inherit",
});

function forwardedHeaders(req, target) {
  return {
    ...req.headers,
    host: target.host,
    "x-forwarded-host": req.headers.host || "",
    "x-forwarded-proto": req.headers["x-forwarded-proto"] || "http",
  };
}

function proxyHttp(req, res) {
  const upstream = http.request(
    {
      protocol: nextOrigin.protocol,
      hostname: nextOrigin.hostname,
      port: nextOrigin.port,
      method: req.method,
      path: req.url,
      headers: forwardedHeaders(req, nextOrigin),
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end(`Dashboard upstream unavailable: ${err.message}`);
  });
  req.pipe(upstream);
}

function proxyUpgrade(req, socket, head) {
  const isApiSocket = (req.url || "").startsWith(WS_PREFIX);
  const target = isApiSocket ? apiOrigin : nextOrigin;
  const path = isApiSocket
    ? `/api/${(req.url || "").slice(WS_PREFIX.length)}`
    : req.url;

  const upstream = http.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    method: "GET",
    path,
    headers: forwardedHeaders(req, target),
  });

  upstream.on("upgrade", (upstreamRes, upstreamSocket, upstreamHead) => {
    let response = `HTTP/1.1 ${upstreamRes.statusCode || 101} ${upstreamRes.statusMessage || "Switching Protocols"}\r\n`;
    for (let i = 0; i < upstreamRes.rawHeaders.length; i += 2) {
      response += `${upstreamRes.rawHeaders[i]}: ${upstreamRes.rawHeaders[i + 1]}\r\n`;
    }
    socket.write(`${response}\r\n`);
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) upstreamSocket.write(head);
    upstreamSocket.pipe(socket).pipe(upstreamSocket);
  });

  upstream.on("response", (upstreamRes) => {
    socket.write(
      `HTTP/1.1 ${upstreamRes.statusCode || 502} ${upstreamRes.statusMessage || "Bad Gateway"}\r\nConnection: close\r\n\r\n`,
    );
    socket.destroy();
  });
  upstream.on("error", () => socket.destroy());
  upstream.end();
}

const server = http.createServer(proxyHttp);
server.on("upgrade", proxyUpgrade);
server.on("clientError", (_err, socket) => socket.destroy());
server.on("error", (err) => {
  console.error(`[dashboard] front server failed: ${err.message}`);
  shutdown(1);
});
server.listen(publicPort, publicHost, () => {
  console.log(
    `[dashboard] listening on http://${publicHost}:${publicPort} (Next :${nextPort}, API WS ${apiOrigin.origin})`,
  );
});

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  server.close(() => process.exit(code));
  next.kill("SIGTERM");
  setTimeout(() => process.exit(code), 5_000).unref();
}

next.on("exit", (code) => shutdown(code || 0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));
