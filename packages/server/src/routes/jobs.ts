import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import {
  CreateJobInput,
  CreateManualJobInput,
  CreateMatchInput,
  DraftOutreachInput,
  ResumeJobInput,
  RetryJobInput,
  SendOutreachInput,
  type MatchScoreView,
} from "@joboutreach/shared";
import type { Db } from "../db/client.js";
import { jobs as jobsTable, matchScores, resumes, outreachEmails } from "../db/schema.js";
import { AccountService, AccountNotFoundError } from "../services/accounts.js";
import { JobService } from "../services/jobs.js";
import { ResumeService, ResumeNotFoundError } from "../services/resumes.js";
import type { JobQueue } from "../services/pipeline/queue.js";
import { pipelineBus } from "../services/pipeline/events.js";
import { scoreResume } from "../services/llm/scoreResume.js";
import { draftOutreach } from "../services/llm/draftOutreach.js";
import { OllamaError } from "../services/llm/ollamaClient.js";
import { SmtpSettingsService } from "../services/mailer/settings.js";
import { SmtpMailer, SmtpError } from "../services/mailer/smtp.js";
import { RESUMES_DIR } from "../config.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

type MatchScoreRow = typeof matchScores.$inferSelect;

function toMatchView(row: MatchScoreRow, resumeName: string): MatchScoreView {
  return {
    id: row.id,
    jobId: row.jobId,
    resumeId: row.resumeId,
    resumeName,
    ollamaAccountId: row.ollamaAccountId,
    modelUsed: row.modelUsed,
    score: row.scoreJson as MatchScoreView["score"],
    overallScore: row.overallScore,
    createdAt: row.createdAt,
  };
}

export function jobRoutes(db: Db, accounts: AccountService, queue: JobQueue) {
  const app = new Hono();
  const jobs = new JobService(db);
  const resumeService = new ResumeService(db);

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

  /** Delete a job and all its related data (matches, contacts, outreach, logs). */
  app.delete("/:id", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid job id" }, 400);

    const job = jobs.get(id);
    if (!job) return c.json({ error: "Job not found" }, 404);

    // Don't allow deleting a job that's actively being processed.
    if (["crawling", "extracting"].includes(job.status)) {
      return c.json({ error: "Cannot delete a job that is currently being processed" }, 409);
    }

    const deleted = jobs.remove(id);
    if (!deleted) return c.json({ error: "Job not found" }, 404);
    pipelineBus.log(id, "info", "job deleted");
    return c.body(null, 204);
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

  /** List all match scores for a job. */
  app.get("/:id/matches", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid job id" }, 400);

    const rows = db
      .select({ match: matchScores, resume: resumes })
      .from(matchScores)
      .innerJoin(resumes, eq(matchScores.resumeId, resumes.id))
      .where(eq(matchScores.jobId, id))
      .orderBy(desc(matchScores.createdAt))
      .all();

    return c.json(rows.map((r) => toMatchView(r.match, r.resume.name)));
  });

  /** Score a resume against the job's extracted JD. */
  app.post("/:id/matches", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid job id" }, 400);

    const parsed = CreateMatchInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);

    const { resumeId, accountId, model } = parsed.data;

    // Validate job exists and has a JD.
    const job = db.select().from(jobsTable).where(eq(jobsTable.id, id)).get();
    if (!job) return c.json({ error: "Job not found" }, 404);
    if (!job.jdJson) return c.json({ error: "Job has no extracted JD — extract first" }, 400);

    // Validate resume.
    const resumeService = new ResumeService(db);
    let resume;
    try {
      resume = resumeService.get(resumeId);
    } catch (e) {
      if (e instanceof ResumeNotFoundError) return c.json({ error: e.message }, 404);
      throw e;
    }
    if (!resume.parsedText.trim()) return c.json({ error: "Resume has no parsed text" }, 400);

    // Get the Ollama client and account.
    let client, account;
    try {
      ({ client, account } = accounts.clientFor(accountId));
    } catch (e) {
      if (e instanceof AccountNotFoundError) return c.json({ error: e.message }, 404);
      throw e;
    }

    const modelUsed = model || account.scoreModel;

    pipelineBus.log(id, "info", `Scoring resume "${resume.name}" with ${modelUsed}…`);

    let result;
    try {
      result = await scoreResume({
        client,
        model: modelUsed,
        jdJson: job.jdJson,
        resumeText: resume.parsedText,
        onLog: (msg) => pipelineBus.log(id, "info", msg),
      });
    } catch (e) {
      if (e instanceof OllamaError) {
        pipelineBus.log(id, "error", `Scoring failed: ${e.message}`);
        if (e.isQuota) {
          const until = e.retryAfter ?? new Date(Date.now() + 3600_000);
          accounts.markQuotaExhausted(accountId, until, e.message);
        }
        return c.json({ error: e.message, kind: e.kind }, (e.status ?? 500) as 400 | 401 | 403 | 404 | 429 | 500);
      }
      throw e;
    }

    // Upsert: unique index on (jobId, resumeId) means re-scoring replaces.
    const existing = db
      .select()
      .from(matchScores)
      .where(eq(matchScores.jobId, id))
      .all()
      .find((m) => m.resumeId === resumeId);

    const scoreJson = result.score;
    const overallScore = result.score.overall;

    if (existing) {
      const updated = db
        .update(matchScores)
        .set({ ollamaAccountId: accountId, modelUsed, scoreJson, overallScore })
        .where(eq(matchScores.id, existing.id))
        .returning()
        .get();
      pipelineBus.log(id, "info", `Score: ${overallScore}/100 (${result.score.verdict}) — updated`);
      pipelineBus.jobStatus(id, job.status);
      return c.json(toMatchView(updated, resume.name));
    }

    const row = db
      .insert(matchScores)
      .values({ jobId: id, resumeId, ollamaAccountId: accountId, modelUsed, scoreJson, overallScore })
      .returning()
      .get();

    pipelineBus.log(id, "info", `Score: ${overallScore}/100 (${result.score.verdict})`);
    pipelineBus.jobStatus(id, job.status);
    return c.json(toMatchView(row, resume.name), 201);
  });

  /** Draft a referral-request email from this job and a selected resume. */
  app.post("/:id/outreach/draft", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid job id" }, 400);

    const parsed = DraftOutreachInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);

    const { resumeId, accountId, model, recipient } = parsed.data;
    const job = jobs.get(id);
    if (!job) return c.json({ error: "Job not found" }, 404);
    if (!job.jd) return c.json({ error: "Job must be extracted before drafting an email" }, 400);

    const resume = resumeService.get(resumeId);
    const { client, account } = accounts.clientFor(accountId);
    const chosenModel = model ?? account.scoreModel;

    try {
      const draft = await draftOutreach({ client, model: chosenModel, job, resumeText: resume.parsedText, recipient });
      return c.json(draft, 200);
    } catch (err) {
      if (err instanceof OllamaError || err instanceof ResumeNotFoundError) {
        return c.json({ error: err.message }, err instanceof OllamaError && err.isQuota ? 429 : 400);
      }
      throw err;
    }
  });

  /** Send the outreach email via SMTP, attaching the selected resume if any.
   *  Records the result in outreach_emails and emits an event. */
  app.post("/:id/outreach/send", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid job id" }, 400);

    const parsed = SendOutreachInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);

    const { to: recipient, subject, body, resumeId } = parsed.data;
    const job = jobs.get(id);
    if (!job) return c.json({ error: "Job not found" }, 404);

    // Build the mailer from stored SMTP settings.
    const smtpService = new SmtpSettingsService(db);
    const view = smtpService.get();
    if (!view) return c.json({ error: "SMTP is not configured" }, 400);
    const decrypted = smtpService.getDecrypted();
    const mailer = new SmtpMailer({
      host: decrypted.host,
      port: decrypted.port,
      secure: decrypted.secure,
      user: decrypted.user,
      password: decrypted.password,
      fromName: decrypted.fromName,
      fromEmail: decrypted.fromEmail,
    });

    // Resolve the resume attachment path if a resume is selected.
    let attachments: Array<{ filename: string; path: string }> | undefined;
    let resumeRow: { id: number; name: string; filePath: string | null } | null = null;
    if (resumeId) {
      const row = db.select().from(resumes).where(eq(resumes.id, resumeId)).get();
      if (!row) return c.json({ error: "Resume not found" }, 404);
      resumeRow = row;
      if (row.filePath) {
        const filePath = join(RESUMES_DIR, row.filePath);
        if (existsSync(filePath)) {
          attachments = [{ filename: row.name, path: filePath }];
        } else {
          return c.json({ error: `Resume file "${row.name}" not found on disk. Re-upload the resume and try again.` }, 400);
        }
      } else {
        return c.json({ error: "Resume has no file on disk. Re-upload the resume and try again." }, 400);
      }
    }

    try {
      await mailer.send({ to: recipient, subject, body, attachments });

      const sentAt = new Date().toISOString();
      db.insert(outreachEmails)
        .values({
          jobId: id,
          resumeId: resumeId ?? null,
          subject,
          body,
          status: "sent",
          sentAt,
        })
        .run();

      pipelineBus.log(id, "info", `Outreach email sent to ${recipient}${attachments ? ` with resume attached` : ""}`);
      return c.json({ ok: true, sentAt });
    } catch (e) {
      const err = e as SmtpError;
      const error = err.message ?? "Failed to send email";
      db.insert(outreachEmails)
        .values({
          jobId: id,
          resumeId: resumeId ?? null,
          subject,
          body,
          status: "failed",
          error,
        })
        .run();

      pipelineBus.log(id, "error", `Outreach email failed: ${error}`);
      const status = err.kind === "auth" ? 401 : err.kind === "connection" ? 502 : 500;
      return c.json({ error, kind: err.kind }, status as 400 | 401 | 500 | 502);
    }
  });

  /** Delete a match score. */
  app.delete("/:id/matches/:matchId", (c) => {
    const id = Number(c.req.param("id"));
    const matchId = Number(c.req.param("matchId"));
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(matchId) || matchId <= 0) {
      return c.json({ error: "Invalid id" }, 400);
    }

    const row = db.select().from(matchScores).where(eq(matchScores.id, matchId)).get();
    if (!row || row.jobId !== id) return c.json({ error: "Match score not found" }, 404);

    db.delete(matchScores).where(eq(matchScores.id, matchId)).run();
    return c.body(null, 204);
  });

  return app;
}
