import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { linkSocialAccount, getGitHubAuthMode, resolveDashboardPublicUrl } = vi.hoisted(() => ({
  linkSocialAccount: vi.fn(),
  getGitHubAuthMode: vi.fn(),
  resolveDashboardPublicUrl: vi.fn(() => "https://ops.example.com"),
}));

vi.mock("../../../src/lib/auth", () => ({
  auth: {
    api: {
      linkSocialAccount,
    },
  },
}));

vi.mock("../../../src/modules/github/github.auth", () => ({
  getGitHubAuthMode,
}));

vi.mock("../../../src/modules/github/github.local-auth", () => ({}));
vi.mock("../../../src/modules/github/github.service", () => ({}));
vi.mock("../../../src/lib/public-url", () => ({
  resolveDashboardPublicUrl,
}));

import { env } from "../../../src/config/env";
import { connectRedirect } from "../../../src/modules/github/github.controller";

const originalCloudMode = env.CLOUD_MODE;

function createContext(headers: Headers) {
  return {
    req: {
      raw: {
        headers,
      },
    },
    redirect: (url: string) =>
      new Response(null, {
        status: 302,
        headers: {
          location: url,
        },
      }),
    text: (body: string, status = 200) => new Response(body, { status }),
  } as any;
}

describe("connectRedirect", () => {
  beforeEach(() => {
    env.CLOUD_MODE = false;
    getGitHubAuthMode.mockReset();
    linkSocialAccount.mockReset();
    resolveDashboardPublicUrl.mockClear();
  });

  afterAll(() => {
    env.CLOUD_MODE = originalCloudMode;
  });

  it("starts a GitHub link flow and forwards the OAuth state cookie", async () => {
    getGitHubAuthMode.mockReturnValue("oauth");
    const headers = new Headers({ cookie: "openship.session_token=test" });

    linkSocialAccount.mockResolvedValue(
      new Response(JSON.stringify({ url: "https://github.com/login/oauth/authorize?client_id=test" }), {
        headers: {
          "content-type": "application/json",
          "set-cookie": "oauth_state=test-state; Path=/; HttpOnly",
        },
      }),
    );

    const response = await connectRedirect(createContext(headers));

    expect(linkSocialAccount).toHaveBeenCalledWith({
      body: {
        provider: "github",
        callbackURL: "/auth/callback/close",
        errorCallbackURL: "/auth/callback/close",
        disableRedirect: true,
      },
      headers,
      asResponse: true,
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://github.com/login/oauth/authorize?client_id=test",
    );
    expect(response.headers.get("set-cookie")).toContain("oauth_state=test-state");
  });

  it("uses the install callback when app mode needs GitHub install flow", async () => {
    getGitHubAuthMode.mockReturnValue("app");

    linkSocialAccount.mockResolvedValue(
      new Response(JSON.stringify({ url: "https://github.com/login/oauth/authorize?client_id=test" }), {
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    await connectRedirect(createContext(new Headers()));

    expect(linkSocialAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          callbackURL: "/auth/callback/install",
        }),
      }),
    );
  });

  it("uses the configured public dashboard URL for a production-served local SaaS", async () => {
    env.CLOUD_MODE = true;
    getGitHubAuthMode.mockReturnValue("app");

    linkSocialAccount.mockResolvedValue(
      new Response(
        JSON.stringify({ url: "https://github.com/login/oauth/authorize?client_id=test" }),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    await connectRedirect(createContext(new Headers()));

    expect(resolveDashboardPublicUrl).toHaveBeenCalledOnce();
    expect(linkSocialAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          callbackURL: "https://ops.example.com/auth/callback/install",
          errorCallbackURL: "https://ops.example.com/auth/callback/close",
        }),
      }),
    );
  });
});
