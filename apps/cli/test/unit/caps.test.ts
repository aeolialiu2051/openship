import { describe, expect, it } from "vitest";

import { ApiError } from "../../src/lib/api-client";
import { requireSelfHost, requireUserServers } from "../../src/lib/caps";
import type { ContextCaps } from "../../src/lib/config";

function caps(selfHosted: boolean): ContextCaps {
  return {
    selfHosted,
    userServers: selfHosted,
    deployMode: "docker",
    authMode: "password",
    teamMode: "single_user",
    cloudAuthUrl: null,
    cloudApiUrl: null,
    fetchedAt: Date.now(),
  };
}

describe("requireSelfHost", () => {
  it("passes for a self-hosted instance", () => {
    expect(() => requireSelfHost(caps(true))).not.toThrow();
  });

  it("throws a 400 ApiError on Vibrail Cloud", () => {
    try {
      requireSelfHost(caps(false));
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(400);
      expect((e as ApiError).message).toMatch(/self-hosted/i);
    }
  });
});

describe("requireUserServers", () => {
  it("passes for a cloud instance with user-owned servers enabled", () => {
    expect(() => requireUserServers({ ...caps(false), userServers: true })).not.toThrow();
  });

  it("passes old self-hosted cached capabilities without the new field", () => {
    expect(() => requireUserServers({ ...caps(true), userServers: undefined })).not.toThrow();
  });

  it("throws when the runtime disables user-owned servers", () => {
    expect(() => requireUserServers({ ...caps(false), userServers: false })).toThrow(
      /user-owned servers/i,
    );
  });
});
