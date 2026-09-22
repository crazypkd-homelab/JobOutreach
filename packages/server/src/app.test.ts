import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { events } from "./db/schema.js";
import { AccountService } from "./services/accounts.js";
import { JobQueue } from "./services/pipeline/queue.js";
import { createApp } from "./app.js";
import { getAuthCookie } from "./test/auth.js";

let app: ReturnType<typeof createApp>;
let cookie: string;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "jo-test-"));
  const db = openDb(join(dir, "test.db"));
  runMigrations(db);
  db.insert(events).values([
    { kind: "crawl", outcome: "success" },
    { kind: "crawl", outcome: "failed" },
    { kind: "email", outcome: "success" },
  ]).run();
  const accounts = new AccountService(db);
  const queue = new JobQueue(db);
  app = createApp(db, { accounts, queue }, { requestLog: false });
  cookie = await getAuthCookie(app);
});

describe("server", () => {
  it("healthz", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("dashboard aggregates events", async () => {
    const res = await app.request("/api/dashboard", { headers: { Cookie: cookie } });
    const body = await res.json();
    expect(body.counts.crawl).toEqual({ success: 1, failed: 1, manual_fallback: 0 });
    expect(body.counts.email.success).toBe(1);
  });

  it("queue status is idle with no jobs", async () => {
    const res = await app.request("/api/queue", { headers: { Cookie: cookie } });
    const body = await res.json();
    expect(body.state).toBe("idle");
    expect(body.queuedCount).toBe(0);
  });
});
