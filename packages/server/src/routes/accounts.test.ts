import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AccountView } from "@joboutreach/shared";
import { bootstrap } from "../config.js";
import { openDb } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { createApp } from "../app.js";

let app: ReturnType<typeof createApp>;

function mockFetch(impl: () => Response) {
  vi.stubGlobal("fetch", vi.fn(impl as unknown as typeof fetch));
}

async function createAccount(label: string, apiKey = "sk-test-abcd1234"): Promise<AccountView> {
  const res = await app.request("/api/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, apiKey }),
  });
  expect(res.status).toBe(201);
  return res.json();
}

beforeEach(() => {
  bootstrap(); // needed for the encryption secret
  const db = openDb(join(mkdtempSync(join(tmpdir(), "jo-acc-")), "test.db"));
  runMigrations(db);
  app = createApp(db, { requestLog: false });
});

afterEach(() => vi.unstubAllGlobals());

describe("accounts API", () => {
  it("stores the key encrypted and only exposes a hint", async () => {
    const account = await createAccount("personal", "sk-secret-key-9876");
    expect(account.keyHint).toBe("…9876");
    expect(JSON.stringify(account)).not.toContain("sk-secret-key");
  });

  it("makes the first account default and moves the flag when another claims it", async () => {
    const first = await createAccount("first");
    expect(first.isDefault).toBe(true);

    const second = await createAccount("second");
    expect(second.isDefault).toBe(false);

    await app.request(`/api/accounts/${second.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });

    const list: AccountView[] = await (await app.request("/api/accounts")).json();
    expect(list.filter((a) => a.isDefault).map((a) => a.id)).toEqual([second.id]);
  });

  it("defaults the per-task models to the cheap/strong pair", async () => {
    const account = await createAccount("models");
    expect(account.extractModel).toBe("gpt-oss:20b");
    expect(account.scoreModel).toBe("gpt-oss:120b");
  });

  it("promotes another account when the default is deleted", async () => {
    const first = await createAccount("first");
    const second = await createAccount("second");

    expect((await app.request(`/api/accounts/${first.id}`, { method: "DELETE" })).status).toBe(204);

    const list: AccountView[] = await (await app.request("/api/accounts")).json();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(second.id);
    expect(list[0]!.isDefault).toBe(true);
  });

  it("rejects invalid input and unknown ids", async () => {
    const bad = await app.request("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "", apiKey: "short" }),
    });
    expect(bad.status).toBe(400);
    expect((await app.request("/api/accounts/999")).status).toBe(404);
  });

  it("lists models for a key", async () => {
    const account = await createAccount("m");
    mockFetch(() => new Response(JSON.stringify({ models: [{ name: "gpt-oss:20b" }] }), { status: 200 }));

    const res = await app.request(`/api/accounts/${account.id}/models`);
    expect(await res.json()).toEqual([{ name: "gpt-oss:20b" }]);
  });

  it("records success on a passing test", async () => {
    const account = await createAccount("ok");
    mockFetch(() => new Response(JSON.stringify({ message: { content: "ok" } }), { status: 200 }));

    const res = await app.request(`/api/accounts/${account.id}/test`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, model: "gpt-oss:20b" });

    const after: AccountView = await (await app.request(`/api/accounts/${account.id}`)).json();
    expect(after.lastUsedAt).not.toBeNull();
    expect(after.lastError).toBeNull();
  });

  it("surfaces a bad key as 401 and remembers the error", async () => {
    const account = await createAccount("bad");
    mockFetch(() => new Response(JSON.stringify({ error: "invalid api key" }), { status: 401 }));

    const res = await app.request(`/api/accounts/${account.id}/test`, { method: "POST" });
    expect(res.status).toBe(401);
    expect((await res.json()).kind).toBe("auth");

    const after: AccountView = await (await app.request(`/api/accounts/${account.id}`)).json();
    expect(after.lastError).toMatch(/invalid api key/);
    expect(after.quotaExhausted).toBe(false);
  });

  it("flags the account as quota-exhausted on 429 so the UI can suggest another", async () => {
    const account = await createAccount("spent");
    mockFetch(() => new Response("limit reached", { status: 429, headers: { "retry-after": "600" } }));

    const res = await app.request(`/api/accounts/${account.id}/test`, { method: "POST" });
    expect(res.status).toBe(429);

    const after: AccountView = await (await app.request(`/api/accounts/${account.id}`)).json();
    expect(after.quotaExhausted).toBe(true);
    expect(new Date(after.quotaExhaustedUntil!).getTime()).toBeGreaterThan(Date.now());
  });

  it("clears the quota flag once a test passes again", async () => {
    const account = await createAccount("recovering");
    mockFetch(() => new Response("limit reached", { status: 429 }));
    await app.request(`/api/accounts/${account.id}/test`, { method: "POST" });

    mockFetch(() => new Response(JSON.stringify({ message: { content: "ok" } }), { status: 200 }));
    await app.request(`/api/accounts/${account.id}/test`, { method: "POST" });

    const after: AccountView = await (await app.request(`/api/accounts/${account.id}`)).json();
    expect(after.quotaExhausted).toBe(false);
  });
});

describe("prompts API", () => {
  it("lists both prompts with their paths", async () => {
    const res = await app.request("/api/prompts");
    const body = await res.json();
    expect(body.map((p: { name: string }) => p.name)).toEqual(["extract_jd", "score_resume"]);
    expect(body[0].text.length).toBeGreaterThan(100);
    expect(body[0].isDefault).toBe(true);
  });

  it("404s on an unknown prompt", async () => {
    expect((await app.request("/api/prompts/nope")).status).toBe(404);
  });

  it("resets a prompt", async () => {
    const res = await app.request("/api/prompts/extract_jd/reset", { method: "POST" });
    expect(res.status).toBe(200);
    expect((await res.json()).isDefault).toBe(true);
  });
});
