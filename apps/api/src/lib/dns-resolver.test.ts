import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolve4: vi.fn(),
  resolve6: vi.fn(),
  resolveCname: vi.fn(),
  resolveTxt: vi.fn(),
  lookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  default: mocks,
}));

import { resolveRecords } from "./dns-resolver";

function dnsResponse(answers?: Array<{ name: string; type: number; data: string }>) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(answers ? { Answer: answers } : { Status: 3 }),
  } as unknown as Response;
}

describe("resolveRecords", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.resolve4.mockRejectedValue(new Error("local resolver unavailable"));
    mocks.resolve6.mockRejectedValue(new Error("local resolver unavailable"));
    mocks.resolveCname.mockRejectedValue(new Error("local resolver unavailable"));
    mocks.resolveTxt.mockRejectedValue(new Error("local resolver unavailable"));
    vi.unstubAllGlobals();
  });

  it("accepts Cloudflare DoH when Google is still serving an NXDOMAIN cache", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      String(input).startsWith("https://dns.google/")
        ? dnsResponse()
        : dnsResponse([
            {
              name: "3x-ui-y3hrwo.vibrail.warpgateapi.com.",
              type: 1,
              data: "136.118.60.116",
            },
          ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveRecords("3x-ui-y3hrwo.vibrail.warpgateapi.com", "A", { timeoutMs: 100 }),
    ).resolves.toEqual(["136.118.60.116"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.resolve4).toHaveBeenCalledOnce();
  });

  it("accepts the local resolver when both public resolvers have empty answers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(dnsResponse()));
    mocks.resolve4.mockResolvedValue(["136.118.60.116"]);

    await expect(resolveRecords("app.example.com", "A", { timeoutMs: 100 })).resolves.toEqual([
      "136.118.60.116",
    ]);
  });

  it("merges and deduplicates answers from independent resolvers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        dnsResponse([{ name: "app.example.com.", type: 1, data: "136.118.60.116" }]),
      ),
    );
    mocks.resolve4.mockResolvedValue(["136.118.60.116", "136.118.60.117"]);

    await expect(resolveRecords("app.example.com", "A", { timeoutMs: 100 })).resolves.toEqual([
      "136.118.60.116",
      "136.118.60.117",
    ]);
  });
});
