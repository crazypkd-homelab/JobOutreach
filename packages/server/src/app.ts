import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Db } from "./db/client.js";
import { WEB_DIST_DIR } from "./config.js";
import { AccountService } from "./services/accounts.js";
import { JobService } from "./services/jobs.js";
import type { JobQueue } from "./services/pipeline/queue.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { accountRoutes } from "./routes/accounts.js";
import { promptRoutes } from "./routes/prompts.js";
import { jobRoutes } from "./routes/jobs.js";
import { queueRoutes } from "./routes/queue.js";
import { eventsRoutes } from "./routes/events.js";
import { resumeRoutes } from "./routes/resumes.js";
import { smtpRoutes } from "./routes/smtp.js";

export interface AppOptions {
  /** Disabled in tests to keep output readable. */
  requestLog?: boolean;
}

export interface AppDeps {
  accounts: AccountService;
  queue: JobQueue;
}

export function createApp(db: Db, deps: AppDeps, { requestLog = true }: AppOptions = {}) {
  const app = new Hono();
  if (requestLog) app.use(logger());

  app.get("/healthz", (c) => c.json({ ok: true }));

  const api = new Hono();
  api.route("/dashboard", dashboardRoutes(db, deps.queue));
  api.route("/accounts", accountRoutes(db));
  api.route("/prompts", promptRoutes());
  api.route("/jobs", jobRoutes(db, deps.accounts, deps.queue));
  api.route("/queue", queueRoutes(db, deps.accounts, deps.queue));
  api.route("/resumes", resumeRoutes(db));
  api.route("/settings/smtp", smtpRoutes(db));
  api.route("/events", eventsRoutes(db));
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
