import { beforeEach, describe, expect, it, vi } from "vitest";

const { waitForPortListening } = vi.hoisted(() => ({
  waitForPortListening: vi.fn(),
}));

vi.mock("@repo/adapters", () => ({ waitForPortListening }));

import {
  auditPorts,
  parseReadinessTimeout,
  PORT_READINESS_TIMEOUT_MS,
} from "../../../src/modules/deployments/port-audit.service";

describe("auditPorts", () => {
  beforeEach(() => {
    waitForPortListening.mockReset();
    waitForPortListening.mockResolvedValue({ listening: true, checked: true });
  });

  it("keeps the short timeout for advisory post-deploy audits", async () => {
    const executor = { exec: vi.fn() };
    const runtime = { inContainerExecutor: vi.fn().mockResolvedValue(executor) } as any;
    const logger = { log: vi.fn() } as any;

    await auditPorts(runtime, "container-1", [8080], logger);

    expect(waitForPortListening).toHaveBeenCalledWith(executor, 8080, {
      timeoutMs: 15_000,
    });
  });

  it("accepts the longer readiness timeout used while an application boots", async () => {
    const executor = { exec: vi.fn() };
    const runtime = { inContainerExecutor: vi.fn().mockResolvedValue(executor) } as any;
    const logger = { log: vi.fn() } as any;

    await auditPorts(runtime, "container-1", [8080], logger, {
      timeoutMs: PORT_READINESS_TIMEOUT_MS,
    });

    expect(waitForPortListening).toHaveBeenCalledWith(executor, 8080, {
      timeoutMs: 180_000,
    });
  });
});

describe("parseReadinessTimeout", () => {
  it("parses bounded compose-style durations", () => {
    expect(parseReadinessTimeout("8m")).toBe(480_000);
    expect(parseReadinessTimeout("30s")).toBe(30_000);
    expect(parseReadinessTimeout("500ms")).toBeNull();
    expect(parseReadinessTimeout("31m")).toBeNull();
    expect(parseReadinessTimeout("forever")).toBeNull();
  });
});
