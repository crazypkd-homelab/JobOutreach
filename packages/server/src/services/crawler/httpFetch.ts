import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { evaluateContent, isBlockStatus, type HeuristicResult } from "./heuristics.js";

export interface FetchResult {
  ok: boolean;
  url: string;
  finalUrl: string;
  status: number;
  text: string;
  html: string;
  reason: string;
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 5_000_000; // 5 MB — don't pull in huge pages

/**
 * Plain HTTP fetch + Readability extraction. This is the cheap first attempt;
 * the browser fallback handles JS-heavy pages.
 */
export async function httpFetch(url: string, signal?: AbortSignal): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  // Link our external signal so callers can cancel too.
  if (signal) signal.addEventListener("abort", () => controller.abort());

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (cause) {
    clearTimeout(timeout);
    const msg = cause instanceof Error ? cause.message : String(cause);
    return {
      ok: false,
      url,
      finalUrl: url,
      status: 0,
      text: "",
      html: "",
      reason: msg.includes("aborted") ? "timeout" : `network error: ${msg}`,
    };
  }
  clearTimeout(timeout);

  if (isBlockStatus(res.status)) {
    return {
      ok: false,
      url,
      finalUrl: res.url || url,
      status: res.status,
      text: "",
      html: "",
      reason: `blocked by HTTP ${res.status}`,
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      url,
      finalUrl: res.url || url,
      status: res.status,
      text: "",
      html: "",
      reason: `HTTP ${res.status}`,
    };
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    return {
      ok: false,
      url,
      finalUrl: res.url || url,
      status: res.status,
      text: "",
      html: "",
      reason: `not HTML (content-type: ${contentType})`,
    };
  }

  // Read the body with a size cap to avoid pulling in multi-MB pages.
  const reader = res.body?.getReader();
  if (!reader) {
    return { ok: false, url, finalUrl: res.url, status: res.status, text: "", html: "", reason: "no response body" };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
  }

  const html = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
  return extractFromHtml(html, url, res.url || url, res.status);
}

/** Extract readable text from an HTML string using Readability + linkedom. */
export function extractFromHtml(
  html: string,
  url: string,
  finalUrl: string,
  status: number,
): FetchResult {
  let text: string;
  try {
    const { document } = parseHTML(html);
    // Readability mutates the DOM, so clone first.
    const doc = document.cloneNode(true) as Document;
    const reader = new Readability(doc as unknown as Document, { charThreshold: 200 });
    const article = reader.parse();
    text = article?.textContent?.trim() ?? "";
    // If Readability can't find an article, fall back to body text.
    if (!text) {
      text = (document.body?.textContent ?? "").replace(/\s{3,}/g, "\n\n").trim();
    }
  } catch (cause) {
    return {
      ok: false,
      url,
      finalUrl,
      status,
      text: "",
      html,
      reason: `readability failed: ${(cause as Error).message}`,
    };
  }

  const verdict: HeuristicResult = evaluateContent(text);
  return {
    ok: verdict.ok,
    url,
    finalUrl,
    status,
    text,
    html,
    reason: verdict.reason,
  };
}
