import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrap } from "../config.js";
import { openDb } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { AccountService } from "../services/accounts.js";
import { JobQueue } from "../services/pipeline/queue.js";
import { createApp } from "../app.js";
import { getAuthCookie } from "../test/auth.js";

let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  bootstrap();
  const db = openDb(join(mkdtempSync(join(tmpdir(), "jo-auth-")), "test.db"));
  runMigrations(db);
  const accounts = new AccountService(db);
  const queue = new JobQueue(db);
  app = createApp(db, { accounts, queue }, { requestLog: false });
});

describe("auth API", () => {
  it("reports setup is needed when no users exist", async () => {
    const res = await app.request("/api/auth/setup");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ needsSetup: true });
  });

  it("registers the first user and returns a session cookie", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "password123" }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ username: "admin" });
    expect(res.headers.get("set-cookie")).toMatch(/^jo_session=/);
  });

  it("rejects a second registration attempt", async () => {
    await getAuthCookie(app);
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "other", password: "password123" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects invalid registration input", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "ab", password: "short" }),
    });
    expect(res.status).toBe(400);
  });

  it("logs in an existing user", async () => {
    await getAuthCookie(app);
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "testpass123" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ username: "testuser" });
  });

  it("rejects bad credentials", async () => {
    await getAuthCookie(app);
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns the current user for a valid session", async () => {
    const cookie = await getAuthCookie(app);
    const res = await app.request("/api/auth/me", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ username: "testuser" });
  });

  it("protects other API routes without a session", async () => {
    const res = await app.request("/api/accounts", { headers: { Cookie: "" } });
    expect(res.status).toBe(401);
  });

  it("clears the session on logout", async () => {
    const cookie = await getAuthCookie(app);
    const logout = await app.request("/api/auth/logout", { method: "POST", headers: { Cookie: cookie } });
    expect(logout.status).toBe(204);
    const setCookie = logout.headers.get("set-cookie");
    expect(setCookie).toContain("jo_session=");
    expect(setCookie).toContain("Max-Age=0");
    const me = await app.request("/api/auth/me");
    expect(me.status).toBe(401);
  });
});
