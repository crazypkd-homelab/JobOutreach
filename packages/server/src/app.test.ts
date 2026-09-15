import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { events } from "./db/schema.js";
import { createApp } from "./app.js";

let app: ReturnType<typeof createApp>;

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), "jo-test-"));
  const db = openDb(join(dir, "test.db"));
  runMigrations(db);
  db.insert(events).values([
    { kind: "crawl", outcome: "success" },
    { kind: "crawl", outcome: "failed" },
    { kind: "email", outcome: "success" },
  ]).run();
  app = createApp(db, { requestLog: false });
});

describe("server", () => {
  it("healthz", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("dashboard aggregates events", async () => {
    const res = await app.request("/api/dashboard");
    const body = await res.json();
    expect(body.counts.crawl).toEqual({ success: 1, failed: 1, manual_fallback: 0 });
    expect(body.counts.email.success).toBe(1);
  });
});
