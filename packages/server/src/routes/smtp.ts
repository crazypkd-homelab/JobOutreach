import { Hono } from "hono";
import { SmtpSettingsInput } from "@joboutreach/shared";
import type { Db } from "../db/client.js";
import { SmtpSettingsService } from "../services/mailer/settings.js";
import { SmtpMailer, SmtpError } from "../services/mailer/smtp.js";

export function smtpRoutes(db: Db) {
  const app = new Hono();
  const service = new SmtpSettingsService(db);

  app.get("/", (c) => {
    const view = service.get();
    if (!view) return c.json({ error: "SMTP not configured" }, 404);
    return c.json(view);
  });

  app.put("/", async (c) => {
    const parsed = SmtpSettingsInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
    try {
      return c.json(service.save(parsed.data));
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  /** Verifies the SMTP server accepts the credentials. */
  app.post("/test", async (c) => {
    const view = service.get();
    if (!view) return c.json({ error: "SMTP not configured" }, 400);
    const decrypted = service.getDecrypted();
    const mailer = new SmtpMailer({
      host: decrypted.host,
      port: decrypted.port,
      secure: decrypted.secure,
      user: decrypted.user,
      password: decrypted.password,
      fromName: decrypted.fromName,
      fromEmail: decrypted.fromEmail,
    });
    try {
      await mailer.verify();
      return c.json({ ok: true });
    } catch (e) {
      const err = e as SmtpError;
      const status = err.kind === "auth" ? 401 : err.kind === "connection" ? 502 : 500;
      return c.json({ error: err.message, kind: err.kind }, status as 400 | 401 | 500 | 502);
    }
  });

  return app;
}
