import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { DashboardCounts } from "@joboutreach/shared";
import type { Db } from "../db/client.js";
import { events } from "../db/schema.js";
import type { JobQueue } from "../services/pipeline/queue.js";

export function dashboardRoutes(db: Db, queue: JobQueue) {
  const app = new Hono();

  app.get("/", (c) => {
    const rows = db
      .select({ kind: events.kind, outcome: events.outcome, n: sql<number>`count(*)` })
      .from(events)
      .groupBy(events.kind, events.outcome)
      .all();

    const counts: DashboardCounts = {
      crawl: { success: 0, failed: 0, manual_fallback: 0 },
      extract: { success: 0, failed: 0 },
      score: { success: 0, failed: 0 },
      email: { success: 0, failed: 0 },
    };
    for (const r of rows) {
      const bucket = counts[r.kind as keyof DashboardCounts] as Record<string, number> | undefined;
      if (bucket && r.outcome in bucket) bucket[r.outcome] = r.n;
    }
    return c.json({ counts, queue: queue.getStatus() });
  });

  return app;
}
