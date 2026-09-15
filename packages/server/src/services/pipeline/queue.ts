import { eq, inArray } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { jobs, ollamaAccounts } from "../../db/schema.js";
import { pipelineBus } from "./events.js";

export type QueueState = "idle" | "running" | "paused";

/**
 * Single-worker FIFO queue. State is persisted as `jobs.status='queued'` so a
 * restart resumes. Only one crawl or LLM call is in flight at any time.
 *
 * On quota exhaustion the queue pauses; the user must explicitly pick an
 * account to resume — no silent auto-switch.
 */
export class JobQueue {
  private running = false;
  private paused = false;
  private pausedReason: string | null = null;
  private currentJobId: number | null = null;
  private processing = false;
  private processor: (jobId: number) => Promise<void>;

  constructor(
    private readonly db: Db,
    processor?: (jobId: number) => Promise<void>,
  ) {
    this.processor = processor ?? (() => Promise.resolve());
  }

  /** Set the processor after construction (breaks the queue ↔ runJob circular dep). */
  setProcessor(fn: (jobId: number) => Promise<void>): void {
    this.processor = fn;
  }

  getState(): QueueState {
    if (this.paused) return "paused";
    return this.running ? "running" : "idle";
  }

  getStatus() {
    const queuedCount = this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.status, "queued"))
      .all().length;
    return {
      state: this.getState(),
      runningJobId: this.currentJobId,
      queuedCount,
      pausedReason: this.pausedReason,
    };
  }

  /** Add a job to the queue and kick the worker. */
  enqueue(jobId: number): void {
    this.db.update(jobs).set({ status: "queued" }).where(eq(jobs.id, jobId)).run();
    pipelineBus.jobStatus(jobId, "queued");
    this.tick();
  }

  /**
   * Pause the queue — called when an account hits its quota.
   * The current job is put back to `queued` so it runs again on resume.
   */
  pause(reason: string, requeueJobId?: number): void {
    this.paused = true;
    this.pausedReason = reason;
    if (requeueJobId !== undefined) {
      this.db.update(jobs).set({ status: "queued" }).where(eq(jobs.id, requeueJobId)).run();
      pipelineBus.jobStatus(requeueJobId, "queued");
    }
    pipelineBus.queueState("paused");
    pipelineBus.log(null, "warn", `queue paused: ${reason}`);
  }

  /**
   * Resume the queue with a specific account. The caller (route) is
   * responsible for updating the job's account before calling this.
   */
  resume(): void {
    this.paused = false;
    this.pausedReason = null;
    pipelineBus.queueState(this.running ? "running" : "idle");
    pipelineBus.log(null, "info", "queue resumed");
    this.tick();
  }

  /**
   * Called on boot: reset interrupted jobs back to queued, then start the
   * worker if there's anything to process.
   */
  resumeOnBoot(): void {
    // Any job stuck in crawling/extracting was interrupted by a restart.
    this.db
      .update(jobs)
      .set({ status: "queued" })
      .where(inArray(jobs.status, ["crawling", "extracting"]))
      .run();
    this.tick();
  }

  private async tick(): Promise<void> {
    if (this.processing || this.paused) return;
    this.processing = true;
    try {
      while (!this.paused) {
        const next = this.db
          .select()
          .from(jobs)
          .where(eq(jobs.status, "queued"))
          .orderBy(jobs.id)
          .limit(1)
          .get();
        if (!next) break;

        this.running = true;
        this.currentJobId = next.id;
        pipelineBus.queueState("running");
        try {
          await this.processor(next.id);
        } catch (err) {
          // The processor handles its own errors; this is a safety net.
          pipelineBus.log(next.id, "error", `processor threw: ${(err as Error).message}`);
          this.db
            .update(jobs)
            .set({ status: "failed", failureReason: (err as Error).message })
            .where(eq(jobs.id, next.id))
            .run();
          pipelineBus.jobStatus(next.id, "failed");
        }
        this.currentJobId = null;
      }
      this.running = false;
      if (!this.paused) pipelineBus.queueState("idle");
    } finally {
      this.processing = false;
    }
  }
}
