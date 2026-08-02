import { lookup } from "node:dns/promises";
import { describe, expect, it, vi } from "vitest";
import { resolvePublicHost, SsrfError } from "./ssrf-guard";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

const lookupMock = vi.mocked(lookup);

describe("resolvePublicHost", () => {
  it("returns an already-public IP without another DNS lookup", async () => {
    await expect(resolvePublicHost("8.8.8.8")).resolves.toBe("8.8.8.8");
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects literal loopback and private addresses", async () => {
    await expect(resolvePublicHost("127.0.0.1")).rejects.toBeInstanceOf(SsrfError);
    await expect(resolvePublicHost("10.0.0.1")).rejects.toBeInstanceOf(SsrfError);
  });

  it("rejects a hostname when any resolved address is private", async () => {
    lookupMock.mockResolvedValueOnce([
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ] as never);

    await expect(resolvePublicHost("example.com")).rejects.toBeInstanceOf(SsrfError);
  });

  it("returns the first address after validating every DNS result", async () => {
    lookupMock.mockResolvedValueOnce([
      { address: "8.8.8.8", family: 4 },
      { address: "1.1.1.1", family: 4 },
    ] as never);

    await expect(resolvePublicHost("example.com")).resolves.toBe("8.8.8.8");
  });
});
