import { createHash, randomBytes } from "node:crypto";

export const CLI_LOGIN_FLOW = "cli-login";
const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_POLL_INTERVAL_MS = 1_500;

export interface BrowserLoginRequest {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  authorizeUrl: string;
}

function trimBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function createBrowserLoginRequest(
  dashboardUrl: string,
  machine?: string,
): BrowserLoginRequest {
  const state = randomBytes(24).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const url = new URL("/authorize", `${trimBaseUrl(dashboardUrl)}/`);
  url.searchParams.set("app", "Vibrail CLI");
  if (machine) url.searchParams.set("machine", machine.slice(0, 80));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("flow", CLI_LOGIN_FLOW);
  return { state, codeVerifier, codeChallenge, authorizeUrl: url.toString() };
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export async function exchangeBrowserLoginCode(
  apiUrl: string,
  code: string,
  codeVerifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(`${trimBaseUrl(apiUrl)}/api/tokens/cli-exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, codeVerifier }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Browser login code was rejected"));
  }
  const body = (await res.json()) as { data?: { token?: string } };
  const token = body.data?.token;
  if (!token) throw new Error("Browser login returned no access token");
  return token;
}

export async function waitForBrowserLogin(
  apiUrl: string,
  request: Pick<BrowserLoginRequest, "state" | "codeVerifier">,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const pollUrl = new URL(`${trimBaseUrl(apiUrl)}/api/tokens/cli-poll`);
    pollUrl.searchParams.set("state", request.state);
    const res = await fetchImpl(pollUrl, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      throw new Error(await errorMessage(res, "Unable to check browser login status"));
    }
    const body = (await res.json()) as { status?: string; code?: string };
    if (body.status === "ready" && body.code) {
      return exchangeBrowserLoginCode(apiUrl, body.code, request.codeVerifier, fetchImpl);
    }
    await sleep(pollIntervalMs);
  }

  throw new Error("Browser login timed out. Run `vibrail login` to try again.");
}
