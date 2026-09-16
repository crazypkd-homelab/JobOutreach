import { eq, desc } from "drizzle-orm";
import type { JobView } from "@joboutreach/shared";
import type { Db } from "../db/client.js";
import { jobs } from "../db/schema.js";

type JobRow = typeof jobs.$inferSelect;

export function toJobView(row: JobRow): JobView {
  return {
    id: row.id,
    sourceUrl: row.sourceUrl,
    sourceType: row.sourceType as "url" | "manual",
    status: row.status as JobView["status"],
    failureReason: row.failureReason,
    ollamaAccountId: row.ollamaAccountId,
    modelUsed: row.modelUsed,
    title: row.title,
    company: row.company,
    location: row.location,
    jd: (row.jdJson as JobView["jd"]) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class JobService {
  constructor(private readonly db: Db) {}

  list(): JobView[] {
    return this.db.select().from(jobs).orderBy(desc(jobs.createdAt)).all().map(toJobView);
  }

  get(id: number): JobView | null {
    const row = this.db.select().from(jobs).where(eq(jobs.id, id)).get();
    return row ? toJobView(row) : null;
  }

  createFromUrl(sourceUrl: string, accountId: number, model?: string): JobView {
    const row = this.db
      .insert(jobs)
      .values({
        sourceUrl,
        sourceType: "url",
        status: "queued",
        ollamaAccountId: accountId,
        modelUsed: model ?? null,
      })
      .returning()
      .get();
    return toJobView(row);
  }

  createFromManual(text: string, accountId: number, model?: string, sourceUrl?: string): JobView {
    const row = this.db
      .insert(jobs)
      .values({
        sourceType: "manual",
        sourceUrl: sourceUrl || null,
        rawText: text,
        status: "queued",
        ollamaAccountId: accountId,
        modelUsed: model ?? null,
      })
      .returning()
      .get();
    return toJobView(row);
  }

  /** Resume a job from needs_manual_input by pasting the posting text. */
  resumeWithText(id: number, text: string, accountId: number, model?: string): JobView | null {
    this.db
      .update(jobs)
      .set({
        rawText: text,
        status: "queued",
        failureReason: null,
        ollamaAccountId: accountId,
        modelUsed: model ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(jobs.id, id))
      .run();
    return this.get(id);
  }

  /** Retry a failed job with a (possibly different) account. */
  retry(id: number, accountId: number, model?: string): JobView | null {
    this.db
      .update(jobs)
      .set({
        status: "queued",
        failureReason: null,
        ollamaAccountId: accountId,
        modelUsed: model ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(jobs.id, id))
      .run();
    return this.get(id);
  }

  /** Update the account/model for a job (used when resuming the queue). */
  setAccount(id: number, accountId: number, model?: string): void {
    this.db
      .update(jobs)
      .set({
        ollamaAccountId: accountId,
        modelUsed: model ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(jobs.id, id))
      .run();
  }

  /** Get the next queued job (used by the queue resume flow). */
  nextQueued(): JobRow | null {
    return this.db.select().from(jobs).where(eq(jobs.status, "queued")).orderBy(jobs.id).limit(1).get() ?? null;
  }

  /** Delete a job and all its related data (cascade handles matches, contacts,
   *  outreach emails, pipeline logs). Returns true if a row was deleted. */
  remove(id: number): boolean {
    const result = this.db.delete(jobs).where(eq(jobs.id, id)).run();
    return result.changes > 0;
  }
}
