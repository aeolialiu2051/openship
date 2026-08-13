import { describe, expect, test, vi } from "vitest";
import { Hono } from "hono";
import { forceMcpConsent } from "@/middleware/mcp-consent";

function makeApp(nextHandler = vi.fn()) {
  const app = new Hono();
  app.use("/api/auth/mcp/authorize", forceMcpConsent);
  app.get("/api/auth/mcp/authorize", (c) => {
    nextHandler();
    return c.text("authorized");
  });
  return app;
}

describe("forceMcpConsent", () => {
  test("uses an origin-relative redirect instead of leaking the internal proxy hostname", async () => {
    const app = makeApp();
    const res = await app.request(
      "http://api:4000/api/auth/mcp/authorize" +
        "?response_type=code" +
        "&client_id=test-client" +
        "&state=test-state" +
        "&code_challenge=test-challenge" +
        "&redirect_uri=http%3A%2F%2F127.0.0.1%3A58158%2Fcallback",
    );

    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    expect(location).toMatch(/^\/api\/auth\/mcp\/authorize\?/);
    expect(location).not.toContain("api:4000");

    const redirected = new URL(location!, "https://app.vibrail.com");
    expect(redirected.origin).toBe("https://app.vibrail.com");
    expect(redirected.searchParams.get("prompt")).toBe("consent");
    expect(redirected.searchParams.get("client_id")).toBe("test-client");
    expect(redirected.searchParams.get("state")).toBe("test-state");
    expect(redirected.searchParams.get("code_challenge")).toBe("test-challenge");
    expect(redirected.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:58158/callback");
  });

  test("continues to Better Auth when consent is already requested", async () => {
    const nextHandler = vi.fn();
    const app = makeApp(nextHandler);
    const res = await app.request(
      "http://api:4000/api/auth/mcp/authorize?client_id=test-client&prompt=consent",
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("authorized");
    expect(nextHandler).toHaveBeenCalledOnce();
  });
});
