import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { createServer as createHttpsServer, request as httpsRequest } from "node:https";
import { connect } from "node:net";
import { readFileSync } from "node:fs";
import { FileDeploymentAuthority } from "./manifest-authority";
import { MemoryNonceStore, verifyOriginRequest, type GatewayConfig } from "./index";
import { VIBRAIL_INTERNAL_HEADERS } from "@repo/core/managed-routing";

const secret = (name: string, required = true): string | undefined => {
  const direct = process.env[name];
  const file = process.env[`${name}_FILE`];
  if (direct && file) throw new Error(`${name} and ${name}_FILE are mutually exclusive`);
  const value = direct ?? (file ? readFileSync(file, "utf8").trim() : undefined);
  if (required && !value) throw new Error(`${name} or ${name}_FILE is required`);
  return value;
};
const required = (name: string): string => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const serverId = required("VIBRAIL_SERVER_ROUTING_ID");
const traefikOrigin = new URL(process.env.VIBRAIL_TRAEFIK_ORIGIN ?? "http://127.0.0.1:8080");
const trustedTraefikHosts = new Set(["127.0.0.1", "localhost", "::1", process.env.VIBRAIL_TRAEFIK_TRUSTED_HOST].filter((value): value is string => !!value));
if (!/^https?:$/.test(traefikOrigin.protocol) || !trustedTraefikHosts.has(traefikOrigin.hostname)) throw new Error("VIBRAIL_TRAEFIK_ORIGIN must be a loopback or explicitly trusted HTTP(S) origin");
const config: GatewayConfig = {
  serverId,
  currentServerSecret: secret("VIBRAIL_SERVER_SECRET")!,
  previousServerSecret: secret("VIBRAIL_PREVIOUS_SERVER_SECRET", false),
  timestampSkewSeconds: Number(process.env.VIBRAIL_ORIGIN_TIMESTAMP_SKEW ?? 60),
  nonceStore: new MemoryNonceStore(),
  authority: new FileDeploymentAuthority(process.env.VIBRAIL_EDGE_ROUTE_MANIFEST),
};

const requestHandler = async (incoming: import("node:http").IncomingMessage, outgoing: import("node:http").ServerResponse) => {
  try {
    const method = incoming.method ?? "GET";
    const request = new Request(`https://${incoming.headers.host ?? "invalid"}${incoming.url ?? "/"}`, { method, headers: incoming.headers as HeadersInit });
    const verified = await verifyOriginRequest(request, config);
    if (!verified.ok) {
      outgoing.writeHead(verified.status).end(verified.status === 404 ? "Not found" : "Forbidden");
      return;
    }
    const headers = { ...incoming.headers };
    for (const name of VIBRAIL_INTERNAL_HEADERS) delete headers[name];
    headers.host = verified.route.hostname;
    const transport = traefikOrigin.protocol === "https:" ? httpsRequest : httpRequest;
    const upstream = transport({
      protocol: traefikOrigin.protocol,
      hostname: traefikOrigin.hostname,
      port: traefikOrigin.port || (traefikOrigin.protocol === "https:" ? 443 : 80),
      method,
      path: incoming.url ?? "/",
      headers,
      ...(traefikOrigin.protocol === "https:" && process.env.VIBRAIL_TRAEFIK_TLS_INSECURE === "true"
        ? { rejectUnauthorized: false }
        : {}),
    }, (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    upstream.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end("Bad gateway"); });
    incoming.pipe(upstream);
  } catch { outgoing.writeHead(502).end("Bad gateway"); }
};

const tlsCertFile = process.env.VIBRAIL_GATEWAY_TLS_CERT_FILE;
const tlsKeyFile = process.env.VIBRAIL_GATEWAY_TLS_KEY_FILE;
if (!!tlsCertFile !== !!tlsKeyFile) throw new Error("Both VIBRAIL_GATEWAY_TLS_CERT_FILE and VIBRAIL_GATEWAY_TLS_KEY_FILE are required");
if (!tlsCertFile && process.env.VIBRAIL_GATEWAY_ALLOW_PLAINTEXT !== "true") {
  throw new Error("Gateway TLS is required; set certificate/key files or explicitly allow plaintext for local development");
}
const server = tlsCertFile && tlsKeyFile
  ? createHttpsServer({ cert: readFileSync(tlsCertFile), key: readFileSync(tlsKeyFile) }, requestHandler)
  : createHttpServer(requestHandler);

server.on("upgrade", async (incoming, socket, head) => {
  try {
    const request = new Request(`https://${incoming.headers.host ?? "invalid"}${incoming.url ?? "/"}`, { method: incoming.method, headers: incoming.headers as HeadersInit });
    const verified = await verifyOriginRequest(request, config);
    if (!verified.ok) { socket.end(`HTTP/1.1 ${verified.status} ${verified.status === 404 ? "Not Found" : "Forbidden"}\r\nConnection: close\r\n\r\n`); return; }
    const upstream = connect(Number(traefikOrigin.port || 80), traefikOrigin.hostname, () => {
      const headers = { ...incoming.headers };
      for (const name of VIBRAIL_INTERNAL_HEADERS) delete headers[name];
      headers.host = verified.route.hostname;
      const lines = [`${incoming.method ?? "GET"} ${incoming.url ?? "/"} HTTP/${incoming.httpVersion}`, ...Object.entries(headers).flatMap(([name, value]) => value === undefined ? [] : [`${name}: ${Array.isArray(value) ? value.join(", ") : value}`]), "", ""];
      upstream.write(lines.join("\r\n"));
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
  } catch { socket.destroy(); }
});

server.listen(Number(process.env.PORT ?? 8443), "0.0.0.0");
