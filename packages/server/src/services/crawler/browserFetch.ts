import type { Browser, Page } from "playwright";
import { extractFromHtml, type FetchResult } from "./httpFetch.js";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const NAV_TIMEOUT_MS = 30_000;
const IDLE_SHUTDOWN_MS = 120_000; // close browser after 2 min idle
const MAX_BYTES = 5_000_000;

let browser: Browser | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  const { chromium } = await import("playwright");
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  return browser;
}

function scheduleIdleShutdown(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
    idleTimer = null;
  }, IDLE_SHUTDOWN_MS);
}

/** Click common "show more" / "read more" buttons to expand collapsed content. */
async function expandContent(page: Page): Promise<void> {
  const selectors = [
    'button:has-text("show more")',
    'button:has-text("Show more")',
    'button:has-text("Read more")',
    'button:has-text("read more")',
    'a:has-text("show more")',
    'a:has-text("See more")',
  ];
  for (const sel of selectors) {
    try {
      const count = await page.locator(sel).count();
      for (let i = 0; i < Math.min(count, 3); i++) {
        await page.locator(sel).nth(i).click({ timeout: 2000 }).catch(() => {});
      }
    } catch {
      // selector not found — fine
    }
  }
}

/**
 * Playwright fallback for JS-heavy pages. Loads the page, waits for network
 * idle, tries to expand collapsed sections, then extracts text.
 */
export async function browserFetch(url: string, signal?: AbortSignal): Promise<FetchResult> {
  if (signal?.aborted) {
    return { ok: false, url, finalUrl: url, status: 0, text: "", html: "", reason: "aborted" };
  }

  let page: Page | null = null;
  try {
    const b = await getBrowser();
    page = await b.newPage({ userAgent: USER_AGENT });
    await page.setViewportSize({ width: 1280, height: 900 });

    if (signal) signal.addEventListener("abort", () => page?.close().catch(() => {}));

    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: NAV_TIMEOUT_MS,
    });

    if (!response) {
      return { ok: false, url, finalUrl: url, status: 0, text: "", html: "", reason: "no response" };
    }

    const status = response.status();
    const finalUrl = page.url();

    // Give JS a moment to render, then try expanding collapsed content.
    await page.waitForTimeout(1000).catch(() => {});
    await expandContent(page);
    await page.waitForTimeout(500).catch(() => {});

    // Cap the HTML size before extracting.
    let html = await page.content();
    if (html.length > MAX_BYTES) html = html.slice(0, MAX_BYTES);

    scheduleIdleShutdown();
    return extractFromHtml(html, url, finalUrl, status);
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, url, finalUrl: url, status: 0, text: "", html: "", reason: `browser error: ${msg}` };
  } finally {
    if (page) await page.close().catch(() => {});
    scheduleIdleShutdown();
  }
}

/** For tests / shutdown. */
export async function closeBrowser(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}
