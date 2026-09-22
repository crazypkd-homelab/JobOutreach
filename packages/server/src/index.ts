import { createRequire } from "node:module";
import { serve } from "@hono/node-server";
import { bootstrap, DATA_DIR, PORT } from "./config.js";
import { openDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { createApp } from "./app.js";
import { AccountService } from "./services/accounts.js";
import { JobQueue } from "./services/pipeline/queue.js";
import { createRunJob } from "./services/pipeline/runJob.js";

// Detect whether Playwright is installed in this image. The slim runtime
// omits it entirely, so the browser fallback must be disabled.
let browserEnabled = true;
try {
  createRequire(import.meta.url)("playwright");
} catch {
  browserEnabled = false;
  console.log("[joboutreach] Playwright not installed; browser fallback disabled");
}

bootstrap();
const db = openDb();
runMigrations(db);

const accounts = new AccountService(db);
const queue = new JobQueue(db);
// runJob needs a reference to the queue; set it after construction to break the circular dep.
queue.setProcessor(createRunJob({ db, accounts, queue, browserEnabled }));

const app = createApp(db, { accounts, queue });

// Resume any interrupted jobs on boot.
queue.resumeOnBoot();

serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(`[joboutreach] data dir: ${DATA_DIR}`);
  console.log(`[joboutreach] listening on http://0.0.0.0:${info.port}`);
});
