import { copyFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PROMPTS_DIR, PROMPTS_DIR } from "../../config.js";

export const PROMPT_NAMES = ["extract_jd", "score_resume"] as const;
export type PromptName = (typeof PROMPT_NAMES)[number];

interface Cached {
  mtimeMs: number;
  text: string;
}

const cache = new Map<PromptName, Cached>();

function fileFor(name: PromptName): string {
  return join(PROMPTS_DIR, `${name}.md`);
}

/**
 * Reads a prompt from the data volume, re-reading only when the file changed.
 * Lets users edit prompts live without a restart.
 */
export function loadPrompt(name: PromptName): string {
  const path = fileFor(name);
  if (!existsSync(path)) {
    resetPrompt(name);
    if (!existsSync(path)) throw new Error(`Prompt "${name}" is missing and has no bundled default`);
  }

  const { mtimeMs } = statSync(path);
  const hit = cache.get(name);
  if (hit && hit.mtimeMs === mtimeMs) return hit.text;

  const text = readFileSync(path, "utf8");
  cache.set(name, { mtimeMs, text });
  return text;
}

export function promptInfo(name: PromptName) {
  const path = fileFor(name);
  const text = loadPrompt(name);
  return { name, path, text, updatedAt: statSync(path).mtime.toISOString(), isDefault: text === defaultText(name) };
}

function defaultText(name: PromptName): string | null {
  const source = join(DEFAULT_PROMPTS_DIR, `${name}.md`);
  return existsSync(source) ? readFileSync(source, "utf8") : null;
}

/** Restores the version bundled with the image. */
export function resetPrompt(name: PromptName): void {
  const source = join(DEFAULT_PROMPTS_DIR, `${name}.md`);
  if (!existsSync(source)) throw new Error(`No bundled default for prompt "${name}"`);
  copyFileSync(source, fileFor(name));
  cache.delete(name);
}

export function isPromptName(value: string): value is PromptName {
  return (PROMPT_NAMES as readonly string[]).includes(value);
}
