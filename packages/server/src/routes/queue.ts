import { Hono } from "hono";
import { ResumeQueueInput } from "@joboutreach/shared";
import type { Db } from "../db/client.js";
import { AccountService } from "../services/accounts.js";
import { JobService } from "../services/jobs.js";
import type { JobQueue } from "../services/pipeline/queue.js";
import { AccountNotFoundError } from "../services/accounts.js";

export function queueRoutes(db: Db, accounts: AccountService, queue: JobQueue) {
  const app = new Hono();
  const jobs = new JobService(db);

  app.get("/", (c) => c.json(queue.getStatus()));

  /**
   * Resume the queue with a specific account. The next queued job's account
   * is updated to the chosen one before unpausing.
   */
  app.post("/resume", async (c) => {
    const parsed = ResumeQueueInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);

    const { accountId } = parsed.data;
    try {
      const account = accounts.get(accountId);
      // Update the next queued job to use this account.
      const next = jobs.nextQueued();
      if (next) {
        jobs.setAccount(next.id, accountId, account.extractModel);
      }
      queue.resume();
      return c.json(queue.getStatus());
    } catch (err) {
      if (err instanceof AccountNotFoundError) return c.json({ error: err.message }, 404);
      throw err;
    }
  });

  return app;
}
