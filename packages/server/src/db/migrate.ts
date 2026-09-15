import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./client.js";

const here = dirname(fileURLToPath(import.meta.url));

// dev (tsx): src/db -> ../../drizzle ; built (tsup): dist -> ../drizzle ; docker: /app/drizzle
const candidates = ["/app/drizzle", resolve(here, "../../drizzle"), resolve(here, "../drizzle")];

export function runMigrations(db: Db): void {
  const migrationsFolder = candidates.find((p) => existsSync(join(p, "meta/_journal.json")));
  if (!migrationsFolder) throw new Error("Migrations folder not found");
  migrate(db, { migrationsFolder });
}
