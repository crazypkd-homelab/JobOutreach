import { httpFetch, type FetchResult } from "./httpFetch.js";
import { browserFetch } from "./browserFetch.js";
import { ATS_ADAPTERS } from "./ats/index.js";

export type { FetchResult } from "./httpFetch.js";

export interface CrawlOptions {
  /** Skip the Playwright fallback (useful when browser is disabled in settings). */
  browserEnabled?: boolean;
  signal?: AbortSignal;
  onLog?: (message: string) => void;
}

/**
 * Orchestrates the crawl: ATS JSON API → plain HTTP + Readability →
 * Playwright fallback. Returns the first successful result, or the last
 * failure so the pipeline can decide to ask the user to paste.
 */
export async function fetchJobPage(url: string, opts: CrawlOptions = {}): Promise<FetchResult> {
  const { browserEnabled = true, signal, onLog } = opts;
  const log = (m: string) => onLog?.(m);

  // 1. Try ATS adapters first — they're the most reliable.
  for (const adapter of ATS_ADAPTERS) {
    if (!adapter.matches(url)) continue;
    log(`ats: trying ${adapter.constructor.name || "adapter"}`);
    const result = await adapter.fetch(url, signal);
    if (result?.ok) {
      log(`ats: success (${result.reason})`);
      return result;
    }
    if (result) log(`ats: ${result.reason}`);
    // If the adapter matched but failed, fall through to generic crawling.
  }

  // 2. Plain HTTP fetch + Readability.
  log(`http: fetching ${url}`);
  const httpResult = await httpFetch(url, signal);
  if (httpResult.ok) {
    log(`http: success (${httpResult.reason})`);
    return httpResult;
  }
  log(`http: ${httpResult.reason}`);

  // 3. Playwright fallback for JS-heavy pages.
  if (browserEnabled) {
    log("browser: launching fallback");
    const browserResult = await browserFetch(url, signal);
    if (browserResult.ok) {
      log(`browser: success (${browserResult.reason})`);
      return browserResult;
    }
    log(`browser: ${browserResult.reason}`);
    // Return the browser result (last attempt) so the caller sees the most recent failure.
    return browserResult;
  }

  return httpResult;
}
