import { Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { RegisterInput, LoginInput } from "@joboutreach/shared";
import { getSecret } from "../config.js";
import type { Db } from "../db/client.js";
import { AuthService, InvalidCredentialsError, UsernameTakenError } from "../services/auth.js";

const COOKIE = "jo_session";
const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

function cookieSecret(): string {
  return getSecret().toString("hex");
}

export function authRoutes(db: Db) {
  const app = new Hono();
  const auth = new AuthService(db);

  app.get("/setup", (c) => c.json({ needsSetup: !auth.hasUsers() }));

  app.post("/register", async (c) => {
    if (auth.hasUsers()) return c.json({ error: "An account already exists" }, 403);
    const parsed = RegisterInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
    try {
      const user = auth.createUser(parsed.data.username, parsed.data.password);
      await setSignedCookie(c, COOKIE, JSON.stringify({ id: user.id, username: user.username }), cookieSecret(), {
        path: "/",
        httpOnly: true,
        maxAge: SESSION_MAX_AGE_S,
        sameSite: "Lax",
        secure: false,
      });
      return c.json({ username: user.username }, 201);
    } catch (e) {
      if (e instanceof UsernameTakenError) return c.json({ error: e.message }, 409);
      throw e;
    }
  });

  app.post("/login", async (c) => {
    const parsed = LoginInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
    try {
      const user = auth.authenticate(parsed.data.username, parsed.data.password);
      await setSignedCookie(c, COOKIE, JSON.stringify({ id: user.id, username: user.username }), cookieSecret(), {
        path: "/",
        httpOnly: true,
        maxAge: SESSION_MAX_AGE_S,
        sameSite: "Lax",
        secure: false,
      });
      return c.json({ username: user.username });
    } catch (e) {
      if (e instanceof InvalidCredentialsError) return c.json({ error: e.message }, 401);
      throw e;
    }
  });

  app.post("/logout", (c) => {
    deleteCookie(c, COOKIE, { path: "/" });
    return c.body(null, 204);
  });

  app.get("/me", async (c) => {
    const payload = await getSignedCookie(c, cookieSecret(), COOKIE);
    if (!payload) return c.json({ error: "Not authenticated" }, 401);
    try {
      const parsed = JSON.parse(payload) as { id?: number; username?: string };
      if (!parsed.username) throw new Error("invalid session");
      return c.json({ username: parsed.username });
    } catch {
      return c.json({ error: "Not authenticated" }, 401);
    }
  });

  return app;
}
