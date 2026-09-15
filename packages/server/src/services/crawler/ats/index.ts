import type { FetchResult } from "../httpFetch.js";

export interface AtsAdapter {
  /** Returns true if this URL is a known ATS pattern we can handle. */
  matches(url: string): boolean;
  /** Fetches the posting via the ATS JSON API. */
  fetch(url: string, signal?: AbortSignal): Promise<FetchResult | null>;
}

/** Turns a Greenhouse board URL into its API equivalent. */
function greenhouseApiUrl(url: string): string | null {
  // https://boards.greenhouse.io/{board}/jobs/{id}
  const m = url.match(/^https?:\/\/boards\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/);
  if (!m) return null;
  const [, board, id] = m;
  return `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}`;
}

export const greenhouse: AtsAdapter = {
  matches(url) {
    return /^https?:\/\/boards\.greenhouse\.io\/[^/]+\/jobs\/\d+/.test(url);
  },
  async fetch(url, signal) {
    const apiUrl = greenhouseApiUrl(url);
    if (!apiUrl) return null;

    const res = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
      signal,
    }).catch(() => null);

    if (!res || !res.ok) return null;
    const data = (await res.json().catch(() => null)) as
      | { title?: string; content?: string; departments?: Array<{ name?: string }>; location?: { name?: string } }
      | null;
    if (!data) return null;

    // Greenhouse returns HTML in `content`; strip tags for the text body.
    const html = data.content ?? "";
    const text = html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/"/g, '"')
      .replace(/\s{3,}/g, "\n\n")
      .trim();

    const dept = data.departments?.[0]?.name;
    const header = [data.title, dept, data.location?.name].filter(Boolean).join("\n");
    const full = `${header}\n\n${text}`;

    return {
      ok: full.trim().length >= 400,
      url,
      finalUrl: url,
      status: res.status,
      text: full,
      html,
      reason: full.trim().length >= 400 ? "greenhouse api" : "greenhouse api: content too short",
    };
  },
};

/** Turns a Lever posting URL into its API equivalent. */
function leverApiUrl(url: string): string | null {
  // https://jobs.lever.co/{company}/{id}
  const m = url.match(/^https?:\/\/jobs\.lever\.co\/([^/]+)\/([a-f0-9-]+)/);
  if (!m) return null;
  const [, , id] = m;
  return `https://api.lever.co/v1/postings/${id}`;
}

export const lever: AtsAdapter = {
  matches(url) {
    return /^https?:\/\/jobs\.lever\.co\/[^/]+\/[a-f0-9-]+/.test(url);
  },
  async fetch(url, signal) {
    const apiUrl = leverApiUrl(url);
    if (!apiUrl) return null;

    const res = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
      signal,
    }).catch(() => null);

    if (!res || !res.ok) return null;
    const data = (await res.json().catch(() => null)) as
      | {
          title?: string;
          description?: string;
          descriptionPlain?: string;
          categories?: { team?: string; location?: string };
        }
      | null;
    if (!data) return null;

    // Lever gives both HTML and plain-text descriptions.
    const html = data.description ?? "";
    const plain = data.descriptionPlain ?? "";
    const text = (plain || html.replace(/<[^>]+>/g, " ").replace(/\s{3,}/g, "\n\n")).trim();

    const team = data.categories?.team;
    const loc = data.categories?.location;
    const header = [data.title, team, loc].filter(Boolean).join("\n");
    const full = `${header}\n\n${text}`;

    return {
      ok: full.trim().length >= 400,
      url,
      finalUrl: url,
      status: res.status,
      text: full,
      html,
      reason: full.trim().length >= 400 ? "lever api" : "lever api: content too short",
    };
  },
};

export const ATS_ADAPTERS: AtsAdapter[] = [greenhouse, lever];
