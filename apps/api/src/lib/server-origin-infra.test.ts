import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  exec: vi.fn(),
  createServerCommandExecutor: vi.fn(),
  resolveEnvironment: vi.fn(),
}));

vi.mock("../config/env", () => ({
  env: {
    VIBRAIL_ROUTING_KV_NAMESPACE_ID: "namespace",
    VIBRAIL_ROUTER_MASTER_SECRET: "0123456789abcdef0123456789abcdef",
    VIBRAIL_CLOUDFLARE_ZONE_ID: "zone",
    VIBRAIL_CLOUDFLARE_API_TOKEN: "token",
    VIBRAIL_MANAGED_DOMAIN: "vibrail.app",
  },
}));
vi.mock("./deployment-runtime", () => ({ createServerCommandExecutor: mocks.createServerCommandExecutor }));
vi.mock("@repo/adapters", () => ({
  CloudflareRouterInfra: class {},
  elevatedExecutor: (executor: unknown) => executor,
  resolveEnvironment: mocks.resolveEnvironment,
}));

import { deriveServerOriginSecret, ensureServerOriginSecret } from "./server-origin-infra";

describe("server origin authentication material", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerCommandExecutor.mockResolvedValue({
      executor: { mkdir: mocks.mkdir, writeFile: mocks.writeFile, exec: mocks.exec },
    });
    mocks.resolveEnvironment.mockResolvedValue({ isRoot: true, canSudo: false });
  });

  it("derives a stable server-specific HMAC secret", () => {
    expect(deriveServerOriginSecret("master", "001")).toBe(
      "efee7d204eb7946642928fdfaf9668db88e2a4fc9f84ef39af6637c2f2c5dbd9",
    );
    expect(deriveServerOriginSecret("master", "002")).not.toBe(
      deriveServerOriginSecret("master", "001"),
    );
  });

  it("writes only the derived secret with root-only permissions", async () => {
    await ensureServerOriginSecret({
      id: "server-db-id",
      routingId: "001",
      organizationId: "org-1",
    } as never);
    expect(mocks.writeFile).toHaveBeenCalledWith(
      "/etc/vibrail/edge/.server-secret.next",
      `${deriveServerOriginSecret("0123456789abcdef0123456789abcdef", "001")}\n`,
    );
    expect(mocks.writeFile.mock.calls[0]![1]).not.toContain(
      "0123456789abcdef0123456789abcdef",
    );
    expect(mocks.exec).toHaveBeenCalledWith(
      "chmod 600 /etc/vibrail/edge/.server-secret.next; if [ -f /etc/vibrail/edge/server-secret ] && ! cmp -s /etc/vibrail/edge/server-secret /etc/vibrail/edge/.server-secret.next; then cp -f /etc/vibrail/edge/server-secret /etc/vibrail/edge/previous-server-secret; chmod 600 /etc/vibrail/edge/previous-server-secret; fi; mv -f /etc/vibrail/edge/.server-secret.next /etc/vibrail/edge/server-secret",
    );
  });
});
