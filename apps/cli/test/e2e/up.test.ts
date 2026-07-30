import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  hasDocker: true,
  composeUpResult: { ok: true, apiPort: "4000", dashPort: "3001" },
  composeUpCalls: 0,
}));

vi.mock("../../src/lib/compose", () => ({
  hasDockerCompose: () => h.hasDocker,
  composeIsViableDefault: () => true,
  composeUp: () => {
    h.composeUpCalls += 1;
    return h.composeUpResult;
  },
  composeInternalToken: () => "tok",
  sourceBuildDir: () => null,
}));

import { upCommand } from "../../src/commands/up";
import { runCommand } from "../helpers/harness";

function captureConsole() {
  let buf = "";
  const sink = (...args: unknown[]) => {
    buf += `${args.map(String).join(" ")}\n`;
  };
  const log = vi.spyOn(console, "log").mockImplementation(sink);
  const error = vi.spyOn(console, "error").mockImplementation(sink);
  return {
    text: () => buf.replace(/\u001b\[[0-9;]*m/g, ""),
    restore: () => {
      log.mockRestore();
      error.mockRestore();
    },
  };
}

let con: ReturnType<typeof captureConsole>;

beforeEach(() => {
  h.hasDocker = true;
  h.composeUpResult = { ok: true, apiPort: "4000", dashPort: "3001" };
  h.composeUpCalls = 0;
  (upCommand as any).setOptionValue?.("compose", undefined);
  con = captureConsole();
});

afterEach(() => {
  con.restore();
  vi.restoreAllMocks();
});

describe("openship up --compose", () => {
  it("fails before compose when Docker Compose is unavailable", async () => {
    h.hasDocker = false;
    const result = await runCommand(upCommand, ["--compose"]);
    expect(result.code).toBe(1);
    expect(h.composeUpCalls).toBe(0);
    expect(con.text()).toContain("docker compose");
  });

  it("starts the control-plane stack without a separate public proxy service", async () => {
    const result = await runCommand(upCommand, ["--compose"]);
    expect(result.code).toBe(0);
    expect(h.composeUpCalls).toBe(1);
  });

  it("returns a failure when compose startup fails", async () => {
    h.composeUpResult = { ok: false, apiPort: "4000", dashPort: "3001" };
    const result = await runCommand(upCommand, ["--compose"]);
    expect(result.code).toBe(1);
    expect(h.composeUpCalls).toBe(1);
  });
});
