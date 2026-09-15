import { describe, expect, it, beforeEach, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { openDb } from "../../db/client.js";
import { runMigrations } from "../../db/migrate.js";
import { jobs, ollamaAccounts } from "../../db/schema.js";
import { JobQueue } from "./queue.js";
import { bootstrap } from "../../config.js";
import { encrypt } from "../crypto.js";

let db: ReturnType<typeof openDb>;
let queue: JobQueue;

beforeEach(() => {
  bootstrap();
  const dir = mkdtempSync(join(tmpdir(), "jo-queue-"));
  db = openDb(join(dir, "test.db"));
  runMigrations(db);

  // Create a test account so jobs have a valid FK.
  db.insert(ollamaAccounts)
    .values({ label: "test", apiKeyEnc: encrypt("sk-test-key-1234567890"), isDefault: true })
    .run();

  queue = new JobQueue(db);
  // Default processor marks the job as extracted so the queue doesn't loop.
  queue.setProcessor(async (jobId) => {
    db.update(jobs).set({ status: "extracted" }).where(eq(jobs.id, jobId)).run();
  });
});

describe("JobQueue", () => {
  it("starts idle with no jobs", () => {
    const status = queue.getStatus();
    expect(status.state).toBe("idle");
    expect(status.queuedCount).toBe(0);
    expect(status.runningJobId).toBeNull();
  });

  it("processes a queued job through the processor", async () => {
    const processed: number[] = [];
    queue.setProcessor(async (jobId) => {
      processed.push(jobId);
      db.update(jobs).set({ status: "extracted" }).where(eq(jobs.id, jobId)).run();
    });

    const job = db.insert(jobs).values({
      sourceType: "manual",
      rawText: "x".repeat(200),
      status: "queued",
      ollamaAccountId: 1,
    }).returning().get();

    queue.enqueue(job.id);
    await new Promise((r) => setTimeout(r, 100));

    expect(processed).toEqual([job.id]);
    const updated = db.select().from(jobs).where(eq(jobs.id, job.id)).get();
    expect(updated?.status).toBe("extracted");
    expect(queue.getState()).toBe("idle");
  });

  it("pauses and requeues the current job on quota exhaustion", async () => {
    queue.setProcessor(async (jobId) => {
      queue.pause("quota exhausted", jobId);
    });

    const job = db.insert(jobs).values({
      sourceType: "manual",
      rawText: "x".repeat(200),
      status: "queued",
      ollamaAccountId: 1,
    }).returning().get();

    queue.enqueue(job.id);
    await new Promise((r) => setTimeout(r, 100));

    expect(queue.getState()).toBe("paused");
    expect(queue.getStatus().pausedReason).toBe("quota exhausted");

    const updated = db.select().from(jobs).where(eq(jobs.id, job.id)).get();
    expect(updated?.status).toBe("queued");
  });

  it("resumes after pause and processes remaining jobs", async () => {
    const processed: number[] = [];
    let firstCall = true;
    queue.setProcessor(async (jobId) => {
      if (firstCall) {
        firstCall = false;
        queue.pause("quota exhausted", jobId);
        return;
      }
      processed.push(jobId);
      db.update(jobs).set({ status: "extracted" }).where(eq(jobs.id, jobId)).run();
    });

    const job = db.insert(jobs).values({
      sourceType: "manual",
      rawText: "x".repeat(200),
      status: "queued",
      ollamaAccountId: 1,
    }).returning().get();

    queue.enqueue(job.id);
    await new Promise((r) => setTimeout(r, 100));
    expect(queue.getState()).toBe("paused");

    queue.resume();
    await new Promise((r) => setTimeout(r, 100));

    expect(processed).toEqual([job.id]);
    expect(queue.getState()).toBe("idle");
  });

  it("resets interrupted jobs to queued on boot", async () => {
    // Insert jobs in non-queued states (simulating a crash mid-processing).
    db.insert(jobs).values({
      sourceType: "manual",
      rawText: "x".repeat(200),
      status: "crawling",
      ollamaAccountId: 1,
    }).run();
    db.insert(jobs).values({
      sourceType: "manual",
      rawText: "x".repeat(200),
      status: "extracting",
      ollamaAccountId: 1,
    }).run();

    // Use a fresh queue with a processor that marks jobs done.
    const q = new JobQueue(db);
    q.setProcessor(async (jobId) => {
      db.update(jobs).set({ status: "extracted" }).where(eq(jobs.id, jobId)).run();
    });
    q.resumeOnBoot();

    // Wait for processing.
    await new Promise((r) => setTimeout(r, 150));

    const all = db.select().from(jobs).all();
    expect(all.every((j) => j.status === "extracted")).toBe(true);
  });
});
