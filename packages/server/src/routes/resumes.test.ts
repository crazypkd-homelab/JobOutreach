import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResumeView } from "@joboutreach/shared";
import { bootstrap } from "../config.js";
import { openDb } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { AccountService } from "../services/accounts.js";
import { JobQueue } from "../services/pipeline/queue.js";
import { createApp } from "../app.js";
import { getAuthCookie } from "../test/auth.js";

let app: ReturnType<typeof createApp>;
let cookie: string;

beforeEach(async () => {
  bootstrap();
  const db = openDb(join(mkdtempSync(join(tmpdir(), "jo-resumes-")), "test.db"));
  runMigrations(db);
  const accounts = new AccountService(db);
  const queue = new JobQueue(db);
  app = createApp(db, { accounts, queue }, { requestLog: false });
  cookie = await getAuthCookie(app);
});

afterEach(() => vi.unstubAllGlobals());

// A minimal valid PDF that pdf-parse can extract text from.
const MINIMAL_PDF = Buffer.from(
  `%PDF-1.0
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length 44>>stream
BT /F1 12 Tf 100 700 Td (John Doe Software Engineer) Tj ET
endstream endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000340 00000 n 
trailer<</Size 6/Root 1 0 R>>
startxref
434
%%EOF`,
);

describe("resumes API", () => {
  it("lists resumes (empty initially)", async () => {
    const res = await app.request("/api/resumes", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("uploads a PDF resume and extracts text", async () => {
    const form = new FormData();
    form.append("file", new File([MINIMAL_PDF], "resume.pdf", { type: "application/pdf" }));

    const res = await app.request("/api/resumes", { method: "POST", body: form, headers: { Cookie: cookie } });
    expect(res.status).toBe(201);
    const resume: ResumeView = await res.json();
    expect(resume.name).toBe("resume.pdf");
    expect(resume.mime).toBe("application/pdf");
    expect(resume.isActive).toBe(true);
    expect(resume.parsedText.length).toBeGreaterThan(0);
  });

  it("rejects empty file upload", async () => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array(0)], "empty.pdf", { type: "application/pdf" }));

    const res = await app.request("/api/resumes", { method: "POST", body: form, headers: { Cookie: cookie } });
    expect(res.status).toBe(400);
  });

  it("rejects missing file field", async () => {
    const res = await app.request("/api/resumes", { method: "POST", body: new FormData(), headers: { Cookie: cookie } });
    expect(res.status).toBe(400);
  });

  it("gets a resume by id", async () => {
    const form = new FormData();
    form.append("file", new File([MINIMAL_PDF], "cv.pdf", { type: "application/pdf" }));
    const created: ResumeView = await (await app.request("/api/resumes", { method: "POST", body: form, headers: { Cookie: cookie } })).json();

    const res = await app.request(`/api/resumes/${created.id}`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const fetched: ResumeView = await res.json();
    expect(fetched.id).toBe(created.id);
  });

  it("returns 404 for unknown resume", async () => {
    expect((await app.request("/api/resumes/999", { headers: { Cookie: cookie } })).status).toBe(404);
  });

  it("updates resume name and parsed text", async () => {
    const form = new FormData();
    form.append("file", new File([MINIMAL_PDF], "resume.pdf", { type: "application/pdf" }));
    const created: ResumeView = await (await app.request("/api/resumes", { method: "POST", body: form, headers: { Cookie: cookie } })).json();

    const res = await app.request(`/api/resumes/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ name: "updated-name.pdf", parsedText: "edited text content" }),
    });
    expect(res.status).toBe(200);
    const updated: ResumeView = await res.json();
    expect(updated.name).toBe("updated-name.pdf");
    expect(updated.parsedText).toBe("edited text content");
  });

  it("toggles active state", async () => {
    const form = new FormData();
    form.append("file", new File([MINIMAL_PDF], "resume.pdf", { type: "application/pdf" }));
    const created: ResumeView = await (await app.request("/api/resumes", { method: "POST", body: form, headers: { Cookie: cookie } })).json();
    expect(created.isActive).toBe(true);

    const res = await app.request(`/api/resumes/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ isActive: false }),
    });
    const updated: ResumeView = await res.json();
    expect(updated.isActive).toBe(false);
  });

  it("deletes a resume", async () => {
    const form = new FormData();
    form.append("file", new File([MINIMAL_PDF], "resume.pdf", { type: "application/pdf" }));
    const created: ResumeView = await (await app.request("/api/resumes", { method: "POST", body: form, headers: { Cookie: cookie } })).json();

    expect((await app.request(`/api/resumes/${created.id}`, { method: "DELETE", headers: { Cookie: cookie } })).status).toBe(204);
    expect((await app.request(`/api/resumes/${created.id}`, { headers: { Cookie: cookie } })).status).toBe(404);
  });
});
