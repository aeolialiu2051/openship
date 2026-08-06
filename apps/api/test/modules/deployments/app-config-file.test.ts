import type { CommandExecutor } from "@repo/adapters";
import { describe, expect, it, vi } from "vitest";
import {
  isWritableAppConfig,
  prepareAppConfigMount,
} from "../../../src/modules/deployments/compose/app-config-file";

function executor(options: { exists: boolean }): CommandExecutor {
  return {
    exec: vi.fn(),
    streamExec: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    exists: vi.fn().mockResolvedValue(options.exists),
    mkdir: vi.fn(),
    rm: vi.fn(),
    transferDirectory: vi.fn(),
  } as unknown as CommandExecutor;
}

describe("prepareAppConfigMount", () => {
  it("refreshes read-only generated files on every deploy", async () => {
    const exec = executor({ exists: true });

    const mount = await prepareAppConfigMount(exec, "/host/config.yaml", {
      path: "/app/config.yaml",
      content: "fresh",
    });

    expect(exec.writeFile).toHaveBeenCalledWith("/host/config.yaml", "fresh");
    expect(mount).toBe("/host/config.yaml:/app/config.yaml:ro");
  });

  it("initializes a missing writable file", async () => {
    const exec = executor({ exists: false });

    const mount = await prepareAppConfigMount(exec, "/host/config.yaml", {
      path: "/app/config.yaml",
      content: "initial",
      writable: true,
    });

    expect(exec.writeFile).toHaveBeenCalledWith("/host/config.yaml", "initial");
    expect(mount).toBe("/host/config.yaml:/app/config.yaml:rw");
  });

  it("preserves an existing writable file across redeploys", async () => {
    const exec = executor({ exists: true });

    await prepareAppConfigMount(exec, "/host/config.yaml", {
      path: "/app/config.yaml",
      content: "template",
      writable: true,
    });

    expect(exec.writeFile).not.toHaveBeenCalled();
  });
});

describe("isWritableAppConfig", () => {
  it("keeps existing CLIProxyAPI installs writable after the catalog change", () => {
    expect(
      isWritableAppConfig("cli-proxy-api", {
        path: "/CLIProxyAPI/config.yaml",
      }),
    ).toBe(true);
  });

  it("does not make unrelated legacy generated files writable", () => {
    expect(isWritableAppConfig("supabase", { path: "/docker-entrypoint-initdb.d/init.sql" })).toBe(
      false,
    );
  });
});
