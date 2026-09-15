import { Hono } from "hono";
import { CreateAccountInput, UpdateAccountInput } from "@joboutreach/shared";
import type { Db } from "../db/client.js";
import { AccountNotFoundError, AccountService } from "../services/accounts.js";
import { OllamaError } from "../services/llm/ollamaClient.js";

/** One hour is a reasonable guess when Ollama doesn't send Retry-After. */
const DEFAULT_QUOTA_COOLDOWN_MS = 60 * 60 * 1000;

export function accountRoutes(db: Db) {
  const app = new Hono();
  const accounts = new AccountService(db);

  const idOf = (raw: string | undefined): number => {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) throw new AccountNotFoundError(Number(raw));
    return id;
  };

  app.get("/", (c) => c.json(accounts.list()));

  app.post("/", async (c) => {
    const parsed = CreateAccountInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
    return c.json(accounts.create(parsed.data), 201);
  });

  app.get("/:id", (c) => c.json(accounts.get(idOf(c.req.param("id")))));

  app.patch("/:id", async (c) => {
    const parsed = UpdateAccountInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
    return c.json(accounts.update(idOf(c.req.param("id")), parsed.data));
  });

  app.delete("/:id", (c) => {
    accounts.remove(idOf(c.req.param("id")));
    return c.body(null, 204);
  });

  /** Models this key can run, for the extract/score dropdowns. */
  app.get("/:id/models", async (c) => {
    const id = idOf(c.req.param("id"));
    const { client } = accounts.clientFor(id);
    const models = await client.listModels();
    return c.json(models.map((m) => ({ name: m.name })));
  });

  /** Cheapest possible round-trip to confirm the key works. */
  app.post("/:id/test", async (c) => {
    const id = idOf(c.req.param("id"));
    const { client, account } = accounts.clientFor(id);
    const model = (await c.req.json().catch(() => ({})))?.model ?? account.extractModel;
    await client.ping(model);
    accounts.markUsed(id);
    accounts.clearQuota(id);
    return c.json({ ok: true, model });
  });

  // Turn Ollama failures into actionable responses, and record them on the account
  // so the UI can show why a key stopped working.
  app.onError((err, c) => {
    if (err instanceof AccountNotFoundError) return c.json({ error: err.message }, 404);

    if (err instanceof OllamaError) {
      const id = Number(c.req.param("id"));
      if (Number.isInteger(id) && id > 0) {
        if (err.isQuota) {
          accounts.markQuotaExhausted(id, err.retryAfter ?? new Date(Date.now() + DEFAULT_QUOTA_COOLDOWN_MS), err.message);
        } else {
          accounts.markError(id, err.message);
        }
      }
      const status = err.kind === "auth" ? 401 : err.isQuota ? 429 : 502;
      return c.json({ error: err.message, kind: err.kind }, status);
    }

    console.error("[accounts]", err);
    return c.json({ error: "Internal error" }, 500);
  });

  return app;
}
