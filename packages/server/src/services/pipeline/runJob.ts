import { eq } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { events, jobs, ollamaAccounts, pipelineLogs } from "../../db/schema.js";
import { AccountService } from "../accounts.js";
import { fetchJobPage } from "../crawler/index.js";
import { extractJd } from "../llm/extractJd.js";
import { OllamaError } from "../llm/ollamaClient.js";
import { pipelineBus } from "./events.js";
import type { JobQueue } from "./queue.js";

export interface RunJobDeps {
  db: Db;
  accounts: AccountService;
  queue: JobQueue;
  browserEnabled?: boolean;
}

type JobRow = typeof jobs.$inferSelect;

function log(db: Db, jobId: number, level: "info" | "warn" | "error", message: string): void {
  db.insert(pipelineLogs).values({ jobId, level, message }).run();
  pipelineBus.log(jobId, level, message);
}

function recordEvent(
  db: Db,
  kind: "crawl" | "extract",
  outcome: "success" | "failed" | "manual_fallback",
  jobId: number,
  accountId: number | null,
  meta?: Record<string, unknown>,
): void {
  db.insert(events)
    .values({ kind, outcome, jobId, accountId, metaJson: meta ?? null })
    .run();
}

/**
 * The pipeline state machine for a single job: crawl → extract.
 * Manual-paste jobs skip the crawl and go straight to extraction.
 */
export function createRunJob(deps: RunJobDeps) {
  const { db, accounts, queue, browserEnabled = true } = deps;

  return async function runJob(jobId: number): Promise<void> {
    const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
    if (!job) return;

    const accountId = job.ollamaAccountId;
    if (!accountId) {
      log(db, jobId, "error", "no Ollama account selected for this job");
      db.update(jobs).set({ status: "failed", failureReason: "No Ollama account selected" }).where(eq(jobs.id, jobId)).run();
      pipelineBus.jobStatus(jobId, "failed");
      return;
    }

    const model = job.modelUsed ?? "gpt-oss:20b";

    // ─── Crawl stage ──────────────────────────────────────────────────
    let text = job.rawText ?? "";

    if (job.sourceType === "url" && !text) {
      db.update(jobs).set({ status: "crawling" }).where(eq(jobs.id, jobId)).run();
      pipelineBus.jobStatus(jobId, "crawling");
      log(db, jobId, "info", `crawling ${job.sourceUrl}`);

      const result = await fetchJobPage(job.sourceUrl!, {
        browserEnabled,
        onLog: (m) => log(db, jobId, "info", m),
      });

      if (result.ok) {
        text = result.text;
        db.update(jobs)
          .set({ rawText: text, rawHtml: result.html, status: "extracting", updatedAt: new Date().toISOString() })
          .where(eq(jobs.id, jobId))
          .run();
        pipelineBus.jobStatus(jobId, "extracting");
        log(db, jobId, "info", `crawl ok (${result.text.length} chars from ${result.finalUrl})`);
        recordEvent(db, "crawl", "success", jobId, accountId, { url: result.finalUrl });
      } else {
        log(db, jobId, "warn", `crawl failed: ${result.reason}`);
        recordEvent(db, "crawl", "failed", jobId, accountId, { reason: result.reason });
        // If we got some text despite the heuristics failing, keep it for manual review.
        if (result.text) {
          db.update(jobs).set({ rawText: result.text }).where(eq(jobs.id, jobId)).run();
        }
        db.update(jobs)
          .set({ status: "needs_manual_input", failureReason: result.reason, updatedAt: new Date().toISOString() })
          .where(eq(jobs.id, jobId))
          .run();
        pipelineBus.jobStatus(jobId, "needs_manual_input");
        // Also record a manual_fallback event so the dashboard counts it.
        recordEvent(db, "crawl", "manual_fallback", jobId, accountId, { reason: result.reason });
        return;
      }
    } else {
      // Manual paste or text already present — go straight to extraction.
      db.update(jobs).set({ status: "extracting" }).where(eq(jobs.id, jobId)).run();
      pipelineBus.jobStatus(jobId, "extracting");
      if (job.sourceType === "manual") {
        log(db, jobId, "info", "manual paste — skipping crawl");
      }
    }

    // ─── Extract stage ────────────────────────────────────────────────
    log(db, jobId, "info", `extracting with account=${accountId} model=${model}`);

    const { client } = accounts.clientFor(accountId);
    try {
      const { jd, attempts } = await extractJd({
        client,
        model,
        text,
        sourceUrl: job.sourceUrl,
        onLog: (m) => log(db, jobId, "info", m),
      });

      db.update(jobs)
        .set({
          status: "extracted",
          jdJson: jd,
          title: jd.title,
          company: jd.company,
          location: jd.location,
          failureReason: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(jobs.id, jobId))
        .run();
      pipelineBus.jobStatus(jobId, "extracted");
      log(db, jobId, "info", `extraction ok (${attempts} attempt${attempts > 1 ? "s" : ""}) — ${jd.title} @ ${jd.company}`);
      recordEvent(db, "extract", "success", jobId, accountId, { title: jd.title, company: jd.company, attempts });
      accounts.markUsed(accountId);
    } catch (err) {
      if (err instanceof OllamaError && err.isQuota) {
        log(db, jobId, "warn", `quota exhausted on account ${accountId}: ${err.message}`);
        recordEvent(db, "extract", "failed", jobId, accountId, { reason: "quota", message: err.message });
        accounts.markQuotaExhausted(accountId, err.retryAfter ?? new Date(Date.now() + 60 * 60 * 1000), err.message);
        // Pause the queue and requeue this job — the user must pick another account.
        queue.pause(`Account ${accountId} hit its quota`, jobId);
        return;
      }

      const message = err instanceof Error ? err.message : String(err);
      log(db, jobId, "error", `extraction failed: ${message}`);
      recordEvent(db, "extract", "failed", jobId, accountId, { reason: "error", message });
      if (err instanceof OllamaError) {
        accounts.markError(accountId, err.message);
      }
      db.update(jobs)
        .set({ status: "failed", failureReason: message, updatedAt: new Date().toISOString() })
        .where(eq(jobs.id, jobId))
        .run();
      pipelineBus.jobStatus(jobId, "failed");
    }
  };
}
