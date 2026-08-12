import { describe, expect, it } from "vitest";
import { usesServerEndpointRouting } from "./preflight-routing";

describe("usesServerEndpointRouting", () => {
  it("uses port routing for a server project", () => {
    expect(usesServerEndpointRouting({ hasServer: true })).toBe(true);
  });

  it("keeps a single-app static project on path routing", () => {
    expect(usesServerEndpointRouting({ hasServer: false })).toBe(false);
  });

  it("lets the service pipeline override a stale/static project classification", () => {
    expect(
      usesServerEndpointRouting({
        hasServer: false,
        multiService: true,
      }),
    ).toBe(true);
  });
});
