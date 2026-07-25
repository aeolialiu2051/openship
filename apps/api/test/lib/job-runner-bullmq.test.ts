import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queues: [] as Array<{
    name: string;
    options: Record<string, unknown>;
    add: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }>,
  workers: [] as Array<{
    name: string;
    processor: (job: { data: Record<string, string> }) => Promise<void>;
    options: Record<string, unknown>;
    on: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }>,
  repos: {
    resourceOperation: {
      requeueStaleRunning: vi.fn(),
      listQueued: vi.fn(),
    },
  },
}));

vi.mock("@repo/db", () => ({ repos: mocks.repos }));

vi.mock("ioredis", () => ({
  default: class MockRedis {
    on() {}
    disconnect() {}
  },
}));

vi.mock("bullmq", () => ({
  Queue: class MockQueue {
    private readonly record;

    constructor(name: string, options: Record<string, unknown>) {
      this.record = {
        name,
        options,
        add: vi.fn(async () => ({})),
        close: vi.fn(async () => {}),
      };
      mocks.queues.push(this.record);
    }

    add(...args: unknown[]) {
      return this.record.add(...args);
    }

    close() {
      return this.record.close();
    }
  },
  Worker: class MockWorker {
    private readonly record;

    constructor(
      name: string,
      processor: (job: { data: Record<string, string> }) => Promise<void>,
      options: Record<string, unknown>,
    ) {
      this.record = {
        name,
        processor,
        options,
        on: vi.fn(),
        close: vi.fn(async () => {}),
      };
      mocks.workers.push(this.record);
    }

    on(...args: unknown[]) {
      return this.record.on(...args);
    }

    close() {
      return this.record.close();
    }
  },
}));

import { BullMQJobRunner } from "../../src/lib/job-runner/bullmq";

describe("BullMQJobRunner resource operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queues.length = 0;
    mocks.workers.length = 0;
    mocks.repos.resourceOperation.requeueStaleRunning.mockResolvedValue([]);
    mocks.repos.resourceOperation.listQueued.mockResolvedValue([
      { id: "op_recovered" },
    ]);
  });

  it("recovers durable queued rows and allows the same operation id to retry", async () => {
    const processOperation = vi.fn(async () => {});
    const runner = new BullMQJobRunner();

    await runner.startResourceOperations({ processOperation });

    const queue = mocks.queues.find((item) => item.name === "resource-operation");
    expect(queue).toBeDefined();
    expect(queue?.options).toMatchObject({
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
    expect(mocks.repos.resourceOperation.requeueStaleRunning).toHaveBeenCalledOnce();
    expect(queue?.add).toHaveBeenCalledWith(
      "run",
      { operationId: "op_recovered" },
      { jobId: "op_recovered", attempts: 1 },
    );

    await runner.enqueueResourceOperation("op_recovered");
    expect(queue?.add).toHaveBeenCalledTimes(2);

    const worker = mocks.workers.find((item) => item.name === "resource-operation");
    await worker?.processor({ data: { operationId: "op_recovered" } });
    expect(processOperation).toHaveBeenCalledWith("op_recovered");

    await runner.shutdown();
  });
});
