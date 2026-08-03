import { describe, expect, it } from "vitest";
import {
  CLI_LOGIN_FLOW,
  createBrowserLoginRequest,
  waitForBrowserLogin,
} from "../../src/lib/browser-login";

describe("browser login", () => {
  it("builds a PKCE authorization URL", () => {
    const request = createBrowserLoginRequest(
      "https://vibrail.example.com/dashboard/",
      "dev machine",
    );
    const url = new URL(request.authorizeUrl);

    expect(url.origin + url.pathname).toBe("https://vibrail.example.com/dashboard/authorize");
    expect(url.searchParams.get("flow")).toBe(CLI_LOGIN_FLOW);
    expect(url.searchParams.get("machine")).toBe("dev machine");
    expect(url.searchParams.get("state")).toBe(request.state);
    expect(url.searchParams.get("code_challenge")).toBe(request.codeChallenge);
    expect(request.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(request.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("polls and exchanges the one-time code", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("cli-poll")) {
        const status =
          calls.filter((value) => value.includes("cli-poll")).length === 1
            ? { status: "pending" }
            : { status: "ready", code: "one-time-code" };
        return Response.json(status);
      }
      return Response.json({ data: { token: "vibrail_pat_browser" } });
    }) as typeof fetch;

    await expect(
      waitForBrowserLogin(
        "https://api.example.com/",
        { state: "state-value-123456", codeVerifier: "verifier" },
        { fetchImpl, sleep: async () => undefined, timeoutMs: 1_000 },
      ),
    ).resolves.toBe("vibrail_pat_browser");
    expect(calls).toHaveLength(3);
    expect(calls[2]).toBe("https://api.example.com/api/tokens/cli-exchange");
  });
});
