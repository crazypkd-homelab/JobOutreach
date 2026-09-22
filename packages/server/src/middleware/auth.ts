import { createMiddleware } from "hono/factory";
import { getSignedCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { getSecret } from "../config.js";
import type { Db } from "../db/client.js";
import { users } from "../db/schema.js";

const COOKIE = "jo_session";

const PUBLIC_PATHS = new Set([
  "/api/auth/setup",
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/logout",
  "/healthz",
]);

function isPublic(path: string): boolean {
  if (PUBLIC_PATHS.has(path)) return true;
  return false;
}

interface SessionUser {
  id: number;
  username: string;
}

declare module "hono" {
  interface ContextVariableMap {
    user: SessionUser;
  }
}

export function authMiddleware(db: Db) {
  return createMiddleware(async (c, next) => {
    if (isPublic(c.req.path)) return next();

    const payload = await getSignedCookie(c, getSecret().toString("hex"), COOKIE);
    if (!payload) return c.json({ error: "Not authenticated" }, 401);

    try {
      const parsed = JSON.parse(payload) as { id?: number; username?: string };
      if (!Number.isInteger(parsed.id) || parsed.id! <= 0 || !parsed.username) {
        return c.json({ error: "Not authenticated" }, 401);
      }
      // Verify the user still exists in case the cookie outlives the account.
      const row = db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.id, parsed.id!))
        .get();
      if (!row) return c.json({ error: "Not authenticated" }, 401);
      c.set("user", { id: row.id, username: row.username });
      await next();
    } catch {
      return c.json({ error: "Not authenticated" }, 401);
    }
  });
}
