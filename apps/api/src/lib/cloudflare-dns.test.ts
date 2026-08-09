import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveRecords: vi.fn(),
}));

vi.mock("@repo/db", () => ({ repos: {} }));
vi.mock("../config/env", () => ({
  env: {
    VIBRAIL_MANAGED_DOMAIN: "vibrail.com",
  },
}));
vi.mock("./encryption", () => ({ decrypt: vi.fn() }));
vi.mock("./edge-target", () => ({
  isNonPublicHost: vi.fn(() => false),
  resolveEdgeTargetHost: vi.fn(),
}));
vi.mock("./dns-resolver", () => ({
  resolveRecords: mocks.resolveRecords,
}));

import { waitForDeploymentDnsPropagation } from "./cloudflare-dns";

describe("waitForDeploymentDnsPropagation", () => {
  beforeEach(() => {
    mocks.resolveRecords.mockReset();
  });

  it("uses the public DNS resolver instead of trusting the API host resolver", async () => {
    mocks.resolveRecords.mockResolvedValue(["136.118.60.116"]);

    await expect(
      waitForDeploymentDnsPropagation("CLIProxyAPI-CLI-Proxy-API-CVQQ59.vibrail.com.", {
        attempts: 1,
        intervalMs: 0,
      }),
    ).resolves.toBe(true);

    expect(mocks.resolveRecords).toHaveBeenCalledWith(
      "cliproxyapi-cli-proxy-api-cvqq59.vibrail.com",
      "A",
      { timeoutMs: 2_000 },
    );
  });

  it("keeps the bounded retry behavior when public DNS has not answered yet", async () => {
    mocks.resolveRecords.mockResolvedValueOnce([]).mockResolvedValueOnce(["136.118.60.116"]);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForDeploymentDnsPropagation("app.vibrail.com", {
        attempts: 2,
        intervalMs: 1,
        sleep,
      }),
    ).resolves.toBe(true);

    expect(mocks.resolveRecords).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("honors a wall-clock deadline even when more attempts were requested", async () => {
    const resolve = vi.fn().mockResolvedValue([]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const now = vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValue(1_002);

    await expect(
      waitForDeploymentDnsPropagation("app.vibrail.com", {
        attempts: 60,
        intervalMs: 1_000,
        deadlineMs: 1,
        resolve,
        sleep,
      }),
    ).resolves.toBe(false);

    expect(resolve).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
    now.mockRestore();
  });
});
