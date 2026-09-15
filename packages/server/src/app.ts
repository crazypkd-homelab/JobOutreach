import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Db } from "./db/client.js";
import { WEB_DIST_DIR } from "./config.js";
import { dashboardRoutes } from "./routes/dashboard.js";

export function createApp(db: Db) {
  const app = new Hono();
  app.use(logger());

  app.get("/healthz", (c) => c.json({ ok: true }));

  const api = new Hono();
  api.route("/dashboard", dashboardRoutes(db));
  api.notFound((c) => c.json({ error: "not found" }, 404));
  app.route("/api", api);

  // SPA: serve built assets, fall back to index.html for client-side routes.
  if (existsSync(WEB_DIST_DIR)) {
    const root = relative(process.cwd(), WEB_DIST_DIR) || ".";
    app.use("/*", serveStatic({ root }));
    const index = readFileSync(join(WEB_DIST_DIR, "index.html"), "utf8");
    app.get("*", (c) => c.html(index));
  } else {
    app.get("/", (c) => c.text("JobOutreach API running. Web UI not built (run `pnpm build`)."));
  }

  return app;
}
