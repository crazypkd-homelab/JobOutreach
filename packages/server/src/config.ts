import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Inside Docker everything lives under /data. For local dev, fall back to ./data at the repo root.
const inContainer = existsSync("/.dockerenv");
const repoRoot = resolve(here, "../../..");

export const PORT = 8787;
export const DATA_DIR = inContainer ? "/data" : join(repoRoot, "data");
export const PROMPTS_DIR = join(DATA_DIR, "prompts");
export const RESUMES_DIR = join(DATA_DIR, "resumes");
export const DB_PATH = join(DATA_DIR, "app.db");
export const SECRET_PATH = join(DATA_DIR, ".secret");

/** Bundled default prompts (shipped with the image / repo). */
export const DEFAULT_PROMPTS_DIR = inContainer ? "/app/prompts" : join(repoRoot, "prompts");

/** Built SPA assets served by Hono. */
export const WEB_DIST_DIR = inContainer ? "/app/web" : join(repoRoot, "packages/web/dist");

let cachedSecret: Buffer | null = null;

export function bootstrap(): void {
  for (const dir of [DATA_DIR, PROMPTS_DIR, RESUMES_DIR]) mkdirSync(dir, { recursive: true });

  if (!existsSync(SECRET_PATH)) {
    writeFileSync(SECRET_PATH, randomBytes(32).toString("hex"), { mode: 0o600 });
  }

  if (existsSync(DEFAULT_PROMPTS_DIR)) {
    for (const file of readdirSync(DEFAULT_PROMPTS_DIR)) {
      const target = join(PROMPTS_DIR, file);
      if (!existsSync(target)) copyFileSync(join(DEFAULT_PROMPTS_DIR, file), target);
    }
  }
}

export function getSecret(): Buffer {
  if (!cachedSecret) cachedSecret = Buffer.from(readFileSync(SECRET_PATH, "utf8").trim(), "hex");
  return cachedSecret;
}
