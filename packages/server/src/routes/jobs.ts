import { Hono } from "hono";
import {
  CreateJobInput,
  CreateManualJobInput,
  ResumeJobInput,
  RetryJobInput,
} from "@joboutreach/shared";
import type { Db } from "../db/client.js";
import { AccountService } from "../services/accounts.js";
import { JobService } from "../services/jobs.js";
import { AccountNotFoundError } from "../services/accounts.js";
import type { JobQueue } from "../services/pipeline/queue.js";
import { pipelineBus } from "../services/pipeline/events.js";

export function jobRoutes(db: Db, accounts: AccountService, queue: JobQueue) {
  const app = new Hono();
  const jobs = new JobService(db);

  app.get("/", (c) => c.json(jobs.list()));

  app.post("/", async (c) => {
    const parsed = CreateJobInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);

    const { sourceUrl, accountId, model } = parsed.data;
    // Verify the account exists and get its default model.
    try {
      const account = accounts.get(accountId);
      const job = jobs.createFromUrl(sourceUrl, accountId, model ?? account.extractModel);
      pipelineBus.log(job.id, "info", `job created from URL: ${sourceUrl}`);
      queue.enqueue(job.id);
      return c.json(job, 201);
    } catch (err) {
      if (err instanceof AccountNotFoundError) return c.json({ error: err.message }, 404);
      throw err;
    }
  });

  app.post("/manual", async (c) => {
    const parsed = CreateManualJobInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);

    const { text, sourceUrl, accountId, model } = parsed.data;
    try {
      const account = accounts.get(accountId);
      const job = jobs.createFromManual(text, accountId, model ?? account.extractModel, sourceUrl || undefined);
      pipelineBus.log(job.id, "info", "job created from manual paste");
      queue.enqueue(job.id);
      return c.json(job, 201);
    } catch (err) {
      if (err instanceof AccountNotFoundError) return c.json({ error: err.message }, 404);
      throw err;
    }
  });

  app.get("/:id", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid job id" }, 400);
    const job = jobs.get(id);
    if (!job) return c.json({ error: "Job not found" }, 404);
    return c.json(job);
  });

  /** Resume a job from needs_manual_input by pasting the posting text. */
  app.post("/:id/text", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid job id" }, 400);

    const parsed = ResumeJobInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);

    const existing = jobs.get(id);
    if (!existing) return c.json({ error: "Job not found" }, 404);
    if (existing.status !== "needs_manual_input") {
      return c.json({ error: "Job is not awaiting manual input" }, 409);
    }

    const { text, accountId, model } = parsed.data;
    try {
      accounts.get(accountId); // verify account exists
      const account = accounts.get(accountId);
      const job = jobs.resumeWithText(id, text, accountId, model ?? account.extractModel);
      pipelineBus.log(id, "info", "manual text provided — resuming extraction");
      queue.enqueue(id);
      return c.json(job);
    } catch (err) {
      if (err instanceof AccountNotFoundError) return c.json({ error: err.message }, 404);
      throw err;
    }
  });

  /** Retry a failed job with a (possibly different) account. */
  app.post("/:id/retry", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid job id" }, 400);

    const parsed = RetryJobInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);

    const existing = jobs.get(id);
    if (!existing) return c.json({ error: "Job not found" }, 404);
    if (existing.status !== "failed" && existing.status !== "extracted") {
      return c.json({ error: "Only failed or extracted jobs can be retried" }, 409);
    }

    const { accountId, model } = parsed.data;
    try {
      const account = accounts.get(accountId);
      const job = jobs.retry(id, accountId, model ?? account.extractModel);
      pipelineBus.log(id, "info", "retrying job");
      queue.enqueue(id);
      return c.json(job);
    } catch (err) {
      if (err instanceof AccountNotFoundError) return c.json({ error: err.message }, 404);
      throw err;
    }
  });

  return app;
}
