import { serve } from "@hono/node-server";
import { bootstrap, DATA_DIR, PORT } from "./config.js";
import { openDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { createApp } from "./app.js";

bootstrap();
const db = openDb();
runMigrations(db);

const app = createApp(db);

serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(`[joboutreach] data dir: ${DATA_DIR}`);
  console.log(`[joboutreach] listening on http://0.0.0.0:${info.port}`);
});
