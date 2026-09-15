import { serve } from "@hono/node-server";
import { bootstrap, DATA_DIR, PORT } from "./config.js";
import { openDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { createApp } from "./app.js";
import { AccountService } from "./services/accounts.js";
import { JobQueue } from "./services/pipeline/queue.js";
import { createRunJob } from "./services/pipeline/runJob.js";

bootstrap();
const db = openDb();
runMigrations(db);

const accounts = new AccountService(db);
const queue = new JobQueue(db);
// runJob needs a reference to the queue; set it after construction to break the circular dep.
queue.setProcessor(createRunJob({ db, accounts, queue, browserEnabled: true }));

const app = createApp(db, { accounts, queue });

// Resume any interrupted jobs on boot.
queue.resumeOnBoot();

serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(`[joboutreach] data dir: ${DATA_DIR}`);
  console.log(`[joboutreach] listening on http://0.0.0.0:${info.port}`);
});
