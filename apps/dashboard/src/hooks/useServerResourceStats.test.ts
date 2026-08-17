import { describe, expect, it } from "vitest";
import { parseBatchedServerStatsEvent, stabilizeServerStats } from "./server-stats-events";

const stats = {
  cpu: 12,
  cpuCores: 4,
  memTotal: 1024,
  memUsed: 512,
  memAvail: 512,
  diskTotal: 4096,
  diskUsed: 1024,
  diskAvail: 3072,
  uptime: "100",
  load1: "0.1",
  load5: "0.2",
  load15: "0.3",
};

describe("parseBatchedServerStatsEvent", () => {
  it("accepts a valid multiplexed sample", () => {
    expect(parseBatchedServerStatsEvent(JSON.stringify({ serverId: "server-1", stats }))).toEqual({
      serverId: "server-1",
      stats,
    });
  });

  it("rejects malformed or non-finite samples", () => {
    expect(parseBatchedServerStatsEvent("not-json")).toBeNull();
    expect(parseBatchedServerStatsEvent(JSON.stringify({ serverId: "", stats }))).toBeNull();
    expect(
      parseBatchedServerStatsEvent(
        JSON.stringify({ serverId: "server-1", stats: { ...stats, cpu: "unknown" } }),
      ),
    ).toBeNull();
  });
});

describe("stabilizeServerStats", () => {
  it("shows the first sample immediately", () => {
    expect(stabilizeServerStats([{ ...stats, cpu: 50 }])?.cpu).toBe(50);
  });

  it("uses the median CPU after the three-sample bootstrap", () => {
    const result = stabilizeServerStats([
      { ...stats, cpu: 50 },
      { ...stats, cpu: 5 },
      { ...stats, cpu: 6, memUsed: 600 },
    ]);

    expect(result?.cpu).toBe(6);
    expect(result?.memUsed).toBe(600);
  });
});
