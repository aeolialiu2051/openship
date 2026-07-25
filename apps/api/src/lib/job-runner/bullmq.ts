/**
 * BullMQ-backed JobRunner.
 *
 * Owns three queues:
 *   `backup-run`       — one-shot run jobs. Concurrency 2 per worker.
 *   `backup-schedule`  — repeat jobs for cron-scheduled policies. Each
 *                        tick enqueues an onTick callback invocation.
 *   `backup-recurring` — repeat jobs for system-internal recurring
 *                        tasks (retention prune, etc.). Same shape as
 *                        backup-schedule but separated so we don't
 *                        mix user policies and infrastructure jobs.
 *
 * The recurring-job callback is in-memory (a Map<jobId, onTick>).
 * BullMQ has the cron schedule + fires at each tick; the worker
 * receives only the jobId and looks up the callback.
 */

import { Queue, Worker, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { repos } from "@repo/db";
import { env } from "../../config/env";
import type { JobRunner } from "./types";

const Q_RUN = "backup-run";
const Q_RECURRING = "backup-recurring";
const Q_RESOURCE_OPERATION = "resource-operation";
const OPERATION_POLL_INTERVAL_MS = 5_000;
const STALE_OPERATION_MS = 2 * 60_000;

export class BullMQJobRunner implements JobRunner {
  readonly name = "bullmq" as const;

  private connection: IORedis | null = null;
  private runQueue: Queue<{ runId: string }> | null = null;
  private recurringQueue: Queue<{ jobId: string }> | null = null;
  private operationQueue: Queue<{ operationId: string }> | null = null;
  private runWorker: Worker<{ runId: string }> | null = null;
  private recurringWorker: Worker<{ jobId: string }> | null = null;
  private operationWorker: Worker<{ operationId: string }> | null = null;
  private operationPollTimer: NodeJS.Timeout | null = null;
  private readonly recurringCallbacks = new Map<string, () => Promise<void>>();
  private started = false;

  private getConnection(): IORedis {
    if (!this.connection) {
      this.connection = new IORedis(env.REDIS_URL, {
        lazyConnect: false,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });
      this.connection.on("error", (err) => {
        console.warn("[job-runner:bullmq] Redis error:", err.message);
      });
    }
    return this.connection;
  }

  private connectionOpts(): ConnectionOptions {
    // bullmq's bundled ioredis types diverge from ours; structurally
    // compatible, cast through unknown.
    return this.getConnection() as unknown as ConnectionOptions;
  }

  async start(opts: { processRun: (runId: string) => Promise<void> }): Promise<void> {
    if (this.started) return;
    this.started = true;

    const conn = this.connectionOpts();

    this.runQueue = new Queue(Q_RUN, {
      connection: conn,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 1000 },
      },
    });
    this.recurringQueue = new Queue(Q_RECURRING, {
      connection: conn,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 200 },
      },
    });

    this.runWorker = new Worker<{ runId: string }>(
      Q_RUN,
      async (job) => {
        const { runId } = job.data;
        if (!runId) throw new Error("backup-run job missing runId");
        await opts.processRun(runId);
      },
      { connection: conn, concurrency: 2 },
    );

    this.recurringWorker = new Worker<{ jobId: string }>(
      Q_RECURRING,
      async (job) => {
        const { jobId } = job.data;
        const cb = this.recurringCallbacks.get(jobId);
        if (!cb) {
          // Stale schedule — onTick was unregistered before the tick.
          // Removing the BullMQ repeatable would be ideal but the
          // worker only sees the job; the caller's removeRecurring
          // handles it on the next sync.
          return;
        }
        await cb();
      },
      { connection: conn, concurrency: 4 },
    );

    this.runWorker.on("failed", (job, err) =>
      console.error(`[job-runner:bullmq:run] job ${job?.id} failed:`, err.message),
    );
    this.recurringWorker.on("failed", (job, err) =>
      console.error(`[job-runner:bullmq:recurring] job ${job?.id} failed:`, err.message),
    );
  }

  async startResourceOperations(opts: {
    processOperation: (operationId: string) => Promise<void>;
  }): Promise<void> {
    if (this.operationWorker) return;
    const conn = this.connectionOpts();
    this.operationQueue = new Queue(Q_RESOURCE_OPERATION, {
      connection: conn,
      defaultJobOptions: {
        attempts: 1,
        // A needs_action retry intentionally reuses the same operation id.
        // Remove terminal Redis jobs immediately so BullMQ's jobId dedupe does
        // not suppress the next authorized attempt.
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
    this.operationWorker = new Worker<{ operationId: string }>(
      Q_RESOURCE_OPERATION,
      async (job) => {
        if (!job.data.operationId) {
          throw new Error("resource-operation job missing operationId");
        }
        await opts.processOperation(job.data.operationId);
      },
      { connection: conn, concurrency: 2 },
    );
    this.operationWorker.on("failed", (job, err) =>
      console.error(
        `[job-runner:bullmq:operation] job ${job?.id} failed:`,
        err.message,
      ),
    );

    // The DB row is the source of truth. This closes the crash window between
    // committing resource_operation and adding the Redis job, and recovers a
    // worker that died after atomically claiming an operation.
    await this.pollResourceOperations();
    this.operationPollTimer = setInterval(() => {
      void this.pollResourceOperations().catch((err) =>
        console.warn(
          "[job-runner:bullmq:operation] DB backstop poll failed:",
          err,
        ),
      );
    }, OPERATION_POLL_INTERVAL_MS);
    this.operationPollTimer.unref();
  }

  async shutdown(_deadlineMs = 30_000): Promise<void> {
    if (this.operationPollTimer) {
      clearInterval(this.operationPollTimer);
      this.operationPollTimer = null;
    }
    await Promise.allSettled([
      this.runWorker?.close(),
      this.recurringWorker?.close(),
      this.operationWorker?.close(),
    ]);
    await Promise.allSettled([
      this.runQueue?.close(),
      this.recurringQueue?.close(),
      this.operationQueue?.close(),
    ]);
    if (this.connection) {
      try {
        this.connection.disconnect();
      } catch {
        // best-effort
      }
      this.connection = null;
    }
    this.started = false;
  }

  async enqueueRun(runId: string): Promise<void> {
    if (!this.runQueue) throw new Error("BullMQJobRunner not started");
    await this.runQueue.add(
      "run",
      { runId },
      {
        jobId: runId, // dedupe replays of the same runId
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
      },
    );
  }

  async enqueueResourceOperation(operationId: string): Promise<void> {
    if (!this.operationQueue) throw new Error("Resource operation runner not started");
    await this.operationQueue.add(
      "run",
      { operationId },
      { jobId: operationId, attempts: 1 },
    );
  }

  private async pollResourceOperations(): Promise<void> {
    if (!this.operationQueue) return;
    await repos.resourceOperation.requeueStaleRunning(
      new Date(Date.now() - STALE_OPERATION_MS),
    );
    const queued = await repos.resourceOperation.listQueued(50);
    for (const operation of queued) {
      await this.enqueueResourceOperation(operation.id);
    }
  }

  async scheduleRecurring(opts: {
    jobId: string;
    cronExpression: string;
    onTick: () => Promise<void>;
  }): Promise<void> {
    if (!this.recurringQueue) throw new Error("BullMQJobRunner not started");
    this.recurringCallbacks.set(opts.jobId, opts.onTick);

    // Remove any existing repeatable with the same jobId so cron edits
    // take effect. BullMQ keys repeatables by `pattern + jobId`; we
    // iterate to find a match.
    const repeatables = await this.recurringQueue.getRepeatableJobs();
    for (const r of repeatables) {
      if (r.id === opts.jobId) {
        await this.recurringQueue.removeRepeatableByKey(r.key);
      }
    }

    await this.recurringQueue.add(
      opts.jobId,
      { jobId: opts.jobId },
      {
        jobId: opts.jobId,
        repeat: { pattern: opts.cronExpression },
        attempts: 1,
      },
    );
  }

  async removeRecurring(jobId: string): Promise<void> {
    this.recurringCallbacks.delete(jobId);
    if (!this.recurringQueue) return;
    const repeatables = await this.recurringQueue.getRepeatableJobs();
    for (const r of repeatables) {
      if (r.id === jobId) await this.recurringQueue.removeRepeatableByKey(r.key);
    }
  }

  describe(): string {
    return `bullmq (Redis @ ${env.REDIS_URL})`;
  }
}
