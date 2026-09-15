import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { httpFetch, extractFromHtml } from "./httpFetch.js";
import { evaluateContent, isBlockStatus } from "./heuristics.js";
import { ATS_ADAPTERS, greenhouse, lever } from "./ats/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");

function fixture(name: string): string {
  return readFileSync(join(fixtures, name), "utf8");
}

function mockFetchHtml(html: string, status = 200, url = "https://example.com/job") {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(html, {
      status,
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  ) as unknown as typeof fetch);
  return url;
}

describe("heuristics", () => {
  it("rejects content below the minimum length", () => {
    const result = evaluateContent("too short");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too short/i);
  });

  it("rejects login walls", () => {
    const text = "Please sign in to see more. Join now to connect with professionals and discover opportunities. " + "x".repeat(500);
    const result = evaluateContent(text);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("login wall");
  });

  it("rejects JS-only pages", () => {
    const text = "Please enable JavaScript to view this page. This site requires JavaScript to function properly. " + "x".repeat(500);
    const result = evaluateContent(text);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("javascript required");
  });

  it("rejects captcha pages", () => {
    const text = "Verify you are human. We need to check that you are not a robot. " + "x".repeat(500);
    const result = evaluateContent(text);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("captcha");
  });

  it("accepts a real job posting", () => {
    const text = fixture("greenhouse-job.html").replace(/<[^>]+>/g, " ").replace(/\s{3,}/g, "\n\n");
    const result = evaluateContent(text);
    expect(result.ok).toBe(true);
  });

  it("rejects text with no job signals", () => {
    const text = "This is a long page about cooking recipes and kitchen equipment. " + "x".repeat(500);
    const result = evaluateContent(text);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no job-posting signals/);
  });

  it("identifies block statuses", () => {
    expect(isBlockStatus(401)).toBe(true);
    expect(isBlockStatus(403)).toBe(true);
    expect(isBlockStatus(429)).toBe(true);
    expect(isBlockStatus(200)).toBe(false);
    expect(isBlockStatus(404)).toBe(false);
  });
});

describe("httpFetch", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("extracts text from a real job posting", async () => {
    const html = fixture("greenhouse-job.html");
    mockFetchHtml(html);
    const result = await httpFetch("https://example.com/job");
    expect(result.ok).toBe(true);
    expect(result.text.length).toBeGreaterThan(400);
    expect(result.text).toContain("Senior Software Engineer");
    expect(result.text).toContain("TypeScript");
  });

  it("rejects a login wall", async () => {
    mockFetchHtml(fixture("login-wall.html"));
    const result = await httpFetch("https://linkedin.com/jobs/123");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("login wall");
  });

  it("rejects a JS-only page", async () => {
    mockFetchHtml(fixture("js-only.html"));
    const result = await httpFetch("https://example.com/job");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("javascript required");
  });

  it("rejects a short page", async () => {
    mockFetchHtml(fixture("short-page.html"));
    const result = await httpFetch("https://example.com/job");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too short/i);
  });

  it("handles HTTP 403 as blocked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("Forbidden", { status: 403, headers: { "content-type": "text/html" } }),
    ) as unknown as typeof fetch);
    const result = await httpFetch("https://example.com/job");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/blocked by HTTP 403/);
  });

  it("handles network errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch);
    const result = await httpFetch("https://example.com/job");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/network error/);
  });

  it("handles non-HTML content types", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    ) as unknown as typeof fetch);
    const result = await httpFetch("https://example.com/api/job");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not HTML/);
  });
});

describe("extractFromHtml", () => {
  it("extracts text directly from HTML without fetching", () => {
    const html = fixture("greenhouse-job.html");
    const result = extractFromHtml(html, "https://example.com", "https://example.com", 200);
    expect(result.ok).toBe(true);
    expect(result.text).toContain("Senior Software Engineer");
  });
});

describe("ATS adapters", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("greenhouse matches board URLs", () => {
    expect(greenhouse.matches("https://boards.greenhouse.io/acme/jobs/12345")).toBe(true);
    expect(greenhouse.matches("https://example.com/job")).toBe(false);
  });

  it("greenhouse fetches from the JSON API", async () => {
    const apiResponse = {
      title: "Senior Engineer",
      content: `<p>We are looking for a senior engineer with 5+ years of experience in TypeScript and Node.js. You will build scalable backend systems and mentor junior engineers. Required skills include SQL, AWS, and distributed systems knowledge. You will be responsible for designing and implementing REST APIs, working with microservices, and collaborating with product teams. This is a full-time remote position with competitive salary and benefits. Apply now if interested.</p>`,
      departments: [{ name: "Engineering" }],
      location: { name: "San Francisco, CA" },
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("boards-api.greenhouse.io")) {
        return new Response(JSON.stringify(apiResponse), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch);

    const result = await greenhouse.fetch("https://boards.greenhouse.io/acme/jobs/12345");
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(true);
    expect(result!.text).toContain("Senior Engineer");
    expect(result!.text).toContain("TypeScript");
  });

  it("lever matches posting URLs", () => {
    expect(lever.matches("https://jobs.lever.co/acme/abc123def456")).toBe(true);
    expect(lever.matches("https://example.com/job")).toBe(false);
  });

  it("lever fetches from the JSON API", async () => {
    const apiResponse = {
      title: "Backend Engineer",
      descriptionPlain: "We are looking for a backend engineer with experience in TypeScript, Node.js, and SQL. You will build and maintain REST APIs, work with distributed systems, and collaborate with the product team. 5+ years of experience required. This is a full-time position with competitive compensation, equity, and benefits. You will be responsible for the full lifecycle of backend services from design to deployment. Apply now if you meet the requirements.",
      categories: { team: "Platform", location: "Remote" },
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("api.lever.co")) {
        return new Response(JSON.stringify(apiResponse), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch);

    const result = await lever.fetch("https://jobs.lever.co/acme/abc123def456");
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(true);
    expect(result!.text).toContain("Backend Engineer");
    expect(result!.text).toContain("TypeScript");
  });

  it("ATS adapters list includes greenhouse and lever", () => {
    expect(ATS_ADAPTERS).toHaveLength(2);
    expect(ATS_ADAPTERS.map((a) => a.matches)).toBeDefined();
  });
});
