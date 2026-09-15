# JobOutreach — Implementation Plan

Self-hosted, open-source job-outreach assistant. Paste a job URL → crawl → Ollama Cloud extracts a structured JD → score your resumes against it → send referral-request emails. Ships as a single Docker image with a "neon agentic" UI.

---

## 1. Goals & Non-Goals

**Goals**
- Single-process, single-image deployment (`docker run` and done). SQLite on a mounted volume; no external services.
- Sequential crawling only (one job at a time, a queue with a single worker).
- Multiple Ollama Cloud accounts (API keys); the user picks which account to use *before* each crawl/extract/score run.
- Prompts live in editable files, **not** in code. LLM output is schema-validated so it is identical in shape every run.
- Manual-paste fallback when a page can't be crawled; the pipeline resumes from the extraction step.
- Multiple resumes (PDF/DOCX upload → text), JD-vs-resume scoring with a breakdown.
- Referral-request emails via the user's own SMTP account, using templates with variable substitution.
- A dashboard with crawl / extraction / email success-failure counters (extensible later).
- Neon / terminal-agent aesthetic instead of a stock dashboard.

**Non-Goals (v1)**
- Parallel crawling, scheduled auto-crawling, applying to jobs automatically.
- Authentication (single-user homelab app; decide later — the Hono middleware slot is left in place so basic auth is a one-file addition).
- Gmail API / OAuth (SMTP only; keep the mailer behind an interface so it can be added later).

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node 22 + TypeScript | One toolchain, one process |
| Server | **Hono** | Tiny, fast, serves API + static SPA from the same process |
| Frontend | **React + Vite + Tailwind** | Built to `dist/`, served statically by Hono |
| DB | **SQLite via `better-sqlite3` + Drizzle ORM** | Zero-ops, single file on a volume, typed migrations |
| Crawling | `undici`/fetch + `@mozilla/readability` + `linkedom`, **Playwright (Chromium) fallback** | Cheap fetch first; render only when needed |
| LLM | Thin in-house client over `fetch` → `https://ollama.com` with Bearer key | Only two endpoints are needed (`/api/chat`, `/api/tags`); avoids a dependency and lets us map HTTP status codes onto precise error kinds (auth / quota / model / network) |
| Validation | **Zod** (single source of truth: Zod → JSON Schema for Ollama → runtime validate) | Guarantees uniform output |
| Resume parsing | `pdf-parse`, `mammoth` (DOCX) | Text extraction |
| Email | `nodemailer` (SMTP) | Works with Gmail app passwords, Outlook, Fastmail, etc. |
| Realtime | Server-Sent Events | Stream pipeline log lines to the UI ("agent console") |
| Package mgmt | pnpm workspaces (`server`, `web`, `shared`) | Shared Zod schemas between client and server |
| Deploy | Multi-stage Dockerfile based on `mcr.microsoft.com/playwright:v1.x-noble` | Chromium preinstalled; one image |

---

## 3. Repository Layout

```
JobOutreach/
├── plan.md
├── README.md
├── docker-compose.yml
├── Dockerfile
├── package.json                 # pnpm workspace root
├── pnpm-workspace.yaml
├── prompts/                     # defaults baked into the image; copied to /data/prompts on first boot
│   ├── extract_jd.md            # system prompt for JD extraction
│   ├── score_resume.md          # system prompt for resume scoring
│   └── README.md                # how to edit safely; output shape is enforced by schema, not prompt
├── packages/
│   ├── shared/                  # Zod schemas + TS types shared by server & web
│   │   └── src/
│   │       ├── schemas/job.ts         # JobDescription schema
│   │       ├── schemas/score.ts       # MatchScore schema
│   │       ├── schemas/api.ts         # request/response DTOs
│   │       └── index.ts
│   ├── server/
│   │   └── src/
│   │       ├── index.ts               # Hono app, static serving, SSE
│   │       ├── config.ts              # fixed paths (/data, /data/prompts), port 8787, secret bootstrap
│   │       ├── db/
│   │       │   ├── schema.ts          # Drizzle tables
│   │       │   ├── migrate.ts         # runs on boot
│   │       │   └── client.ts
│   │       ├── routes/
│   │       │   ├── accounts.ts        # Ollama accounts CRUD + test
│   │       │   ├── jobs.ts            # create from URL / from pasted text, list, detail, retry
│   │       │   ├── resumes.ts         # upload, list, edit text, delete
│   │       │   ├── scores.ts          # score job × resume(s)
│   │       │   ├── outreach.ts        # contacts, templates, send, history
│   │       │   ├── settings.ts        # SMTP config, defaults
│   │       │   ├── dashboard.ts       # aggregate counters for the dashboard
│   │       │   └── events.ts          # SSE stream
│   │       ├── services/
│   │       │   ├── crawler/
│   │       │   │   ├── index.ts       # fetchJobPage(url): CrawlResult
│   │       │   │   ├── httpFetch.ts   # fetch + readability
│   │       │   │   ├── browserFetch.ts# Playwright fallback (lazy-launched, reused)
│   │       │   │   └── heuristics.ts  # "is this real content?" checks, block-page detection
│   │       │   ├── llm/
│   │       │   │   ├── ollamaClient.ts# per-account client, rate-limit/quota error mapping
│   │       │   │   ├── prompts.ts     # load + hot-reload prompt files
│   │       │   │   ├── extractJd.ts   # prompt + schema → JobDescription
│   │       │   │   └── scoreResume.ts # prompt + schema → MatchScore
│   │       │   ├── resumes/parse.ts   # PDF/DOCX → text
│   │       │   ├── mailer/smtp.ts     # nodemailer wrapper + template rendering
│   │       │   ├── pipeline/
│   │       │   │   ├── queue.ts       # single-worker FIFO queue (concurrency = 1)
│   │       │   │   ├── runJob.ts      # state machine: crawl → extract → (score)
│   │       │   │   └── events.ts      # emits log lines / state changes to SSE bus
│   │       │   └── crypto.ts          # encrypt API keys / SMTP password at rest
│   │       └── lib/                   # small helpers
│   └── web/
│       └── src/
│           ├── main.tsx
│           ├── app/                   # router, layout shell
│           ├── theme/                 # neon tokens, fonts, scanline/glow utilities
│           ├── components/
│           │   ├── AgentConsole.tsx   # SSE-driven streaming log panel
│           │   ├── StatusChip.tsx, NeonButton.tsx, Panel.tsx, ...
│           ├── features/
│           │   ├── dashboard/         # counters, recent activity, account health
│           │   ├── jobs/              # list, new job (URL or paste), job detail:
│           │   │                      #   JD view + match scores + outreach, all in-page
│           │   └── account/           # ollama keys, resumes, SMTP, prompts (tabs)
│           └── api/                   # typed fetch client using shared DTOs
└── tests/                             # vitest; fixture HTML pages, schema tests, mocked Ollama
```

---

## 4. Data Model (SQLite / Drizzle)

```
ollama_accounts   id, label, api_key_enc, is_default,
                  extract_model (default 'gpt-oss:20b'),
                  score_model   (default 'gpt-oss:120b'),
                  last_used_at, last_error, quota_exhausted_until (nullable)

jobs              id, source_url (nullable), source_type ('url'|'manual'),
                  title, company, location, raw_html (nullable), raw_text,
                  status ('queued'|'crawling'|'needs_manual_input'|'extracting'|
                          'extracted'|'failed'),
                  failure_reason, ollama_account_id, model_used,
                  jd_json (JobDescription), created_at, updated_at

resumes           id, name, file_path, mime, parsed_text, is_active, created_at

match_scores      id, job_id, resume_id, ollama_account_id, model_used,
                  score_json (MatchScore), overall_score, created_at
                  UNIQUE(job_id, resume_id)  -- rescore overwrites

contacts          id, job_id, name, email, role, linkedin_url, notes

email_templates   id, name, subject, body            -- {{placeholders}}

outreach_emails   id, job_id, contact_id, template_id, resume_id (attachment),
                  subject, body, status ('draft'|'sent'|'failed'),
                  sent_at, error

settings          key, value_enc                     -- smtp_*, defaults
pipeline_logs     id, job_id, ts, level, message     -- backs the AgentConsole

events            id, ts, kind, outcome, job_id, account_id, meta_json
                  -- kind: 'crawl'|'extract'|'score'|'email'
                  -- outcome: 'success'|'failed'|'manual_fallback'
                  -- append-only; the dashboard aggregates this table, so new
                  -- metrics can be added later without schema changes
```

Secrets (Ollama keys, SMTP password) are encrypted with AES-256-GCM. The encryption key is generated on first boot and written to `/data/.secret` (mode 600). No env var required; backing up `./data` backs up everything.

---

## 5. Core Pipeline (single worker)

```
 ┌─────────┐   URL   ┌─────────┐  ok   ┌───────────┐  ok  ┌───────────┐
 │ new job ├────────►│  crawl  ├──────►│  extract  ├─────►│ extracted │
 └────┬────┘         └────┬────┘       └─────┬─────┘      └───────────┘
      │ pasted text        │ fail/blocked      │ invalid JSON ×N
      │                    ▼                   ▼
      │           ┌───────────────────┐    ┌────────┐
      └──────────►│needs_manual_input │    │ failed │ (retry button, pick other account)
                  └────────┬──────────┘    └────────┘
                           │ user pastes text
                           └──────────► extract (same path as above)
```

**Queue:** in-process FIFO, concurrency 1, persisted as job `status='queued'` so a restart resumes. Only one crawl or LLM call in flight at any time.

**Crawl stage (`services/crawler`)**
1. Normalize URL; strip tracking params; known-host adapters for common ATSs where a JSON API exists (Greenhouse `boards-api`, Lever `api.lever.co`, Ashby) — cheap and reliable; fall through if not matched.
2. Plain fetch with realistic UA + timeout (15s). Run Readability. Heuristics: text length ≥ 400 chars, not a login/captcha/"enable JavaScript" page, contains job-ish signals.
3. If heuristics fail → Playwright fallback: load, wait for network idle, click common "show more" buttons, extract `innerText` of main content. Browser instance is lazily launched and reused; closed after idle timeout.
4. If still failing (or HTTP 403/429/login wall) → set `needs_manual_input`, keep the URL, and surface a paste box in the UI. Pasting resumes at step "extract" — no re-crawl.

**Extract stage (`services/llm/extractJd.ts`)**
- Load `/data/prompts/extract_jd.md` (hot-reloaded on change, cached by mtime). Settings has a "Reset to default" button that re-copies the bundled prompt.
- Call Ollama Cloud with the selected account: `chat({ model, messages, format: JOB_DESCRIPTION_FORMAT, temperature: 0 })`, where the format is the JSON Schema derived from the shared Zod schema.
- Parse → `JobDescription.safeParse`. On failure: retry up to 2× with the validation errors appended to the prompt ("fix these fields"). Then `failed` with the raw response saved for debugging.
- Map Ollama errors: 401 → account invalid; 429 / quota messages → mark `quota_exhausted_until` on the account, put the job back to `queued`, and **pause the queue**. The Agent Console shows a banner with a one-click **"Resume with account ▾"** dropdown (pre-selecting the next healthy account). No silent auto-switch — the user always confirms which account is spent.

**Score stage (`services/llm/scoreResume.ts`)**
- Triggered by the user from Match view: choose job × one-or-more resumes × account. Runs sequentially through the same queue.
- Prompt gets the extracted `JobDescription` JSON (not raw HTML) + resume text → `MatchScore` schema.
- Deterministic scaffolding around the LLM: the overall score is *recomputed server-side* from the weighted sub-scores the model returns, so the number is consistent even if the model's arithmetic isn't.

---

## 6. Uniform LLM Output — Schemas (in `packages/shared`)

```ts
JobDescription = {
  title: string,
  company: string,
  location: string | null,
  work_mode: 'remote' | 'hybrid' | 'onsite' | 'unknown',
  employment_type: 'full_time' | 'part_time' | 'contract' | 'internship' | 'unknown',
  seniority: 'intern' | 'junior' | 'mid' | 'senior' | 'staff' | 'lead' | 'manager' | 'unknown',
  years_experience_min: number | null,
  salary: { min: number|null, max: number|null, currency: string|null, period: 'year'|'hour'|null } ,
  summary: string,                          // ≤ 3 sentences
  responsibilities: string[],
  required_skills: string[],                // normalized lowercase, deduped
  preferred_skills: string[],
  education: string | null,
  keywords: string[],                       // ATS keywords
  application_url: string | null,
  posted_date: string | null                // ISO date or null
}

MatchScore = {
  overall: number (0-100),                  // recomputed server-side
  breakdown: {
    required_skills:  { score: 0-100, weight: 0.45, matched: string[], missing: string[] },
    preferred_skills: { score: 0-100, weight: 0.15, matched: string[], missing: string[] },
    experience:       { score: 0-100, weight: 0.20, note: string },
    domain_fit:       { score: 0-100, weight: 0.10, note: string },
    education:        { score: 0-100, weight: 0.10, note: string }
  },
  strengths: string[],
  gaps: string[],
  resume_tweaks: string[],                  // concrete suggestions
  verdict: 'strong' | 'good' | 'weak' | 'poor'
}
```

Prompt files contain instructions and few-shot guidance only; **the shape is enforced by `format` + Zod**, so editing prompts can't break downstream code. Weights live in `settings` and are injected into the prompt and the recomputation.

---

## 7. Ollama Accounts

- Settings → Accounts: add label + API key. Model list is fetched live from `GET https://ollama.com/api/tags` with that key and cached per account. Each account has two defaults: **extract model** (`gpt-oss:20b` — cheap, JD extraction is easy) and **score model** (`gpt-oss:120b` — better judgement). "Test" button does a 1-token chat.
- Every action that calls the LLM (new job, retry, score) shows an **account dropdown + model dropdown**, pre-filled with that account's default for the task; the user can override per run. Both choices are stored on the job/score record (`ollama_account_id`, `model_used`).
- Account card shows last used, last error, and a "quota exhausted" badge with reset hint if a 429 was seen.
- Keys never leave the server; UI shows only last 4 chars.

---

## 8. Outreach (Email)

- Settings → SMTP: host, port, secure, user, password (encrypted), from name/address. "Send test email" button.
- Per job: add contacts (name, email, role, LinkedIn). Templates use `{{first_name}}`, `{{company}}`, `{{job_title}}`, `{{job_url}}`, `{{my_name}}`, `{{top_matched_skills}}`.
- Compose view: pick template + contact + optional resume attachment → live preview → **explicit Send click** (no bulk send in v1; one email per click, aligned with "no automation surprises").
- Optional "Draft with AI" button: asks Ollama to personalize the body using the JD + resume; still shown for editing before send.
- Sent log per job with status/error.

---

## 9. Dashboard

Landing view (`/`). All numbers come from `GET /api/dashboard`, which aggregates the `events` table, so adding a metric later is a query + a tile, not a migration.

**v1 tiles**
- Crawls: successful / failed / manual-fallback (with success-rate %)
- Extractions: successful / failed
- Scores run, average overall score, best-matching job this week
- Emails: sent / failed
- Per-account health: calls today, last error, quota badge
- Recent activity feed (last 20 events) and queue state (idle / running / paused-quota)

Filter by time range (today / 7d / 30d / all). Rendered as neon stat tiles with sparkline strips.

**Later ideas (not v1):** replies received, per-domain crawl success, cost/tokens per account.

---

## 10. UI — "Agentic Neon"

- Dark base (`#07090f`), neon accents (cyan `#00f0ff`, magenta `#ff2bd6`, lime `#b6ff00`), monospace UI font (JetBrains Mono / IBM Plex Mono), subtle CRT scanline overlay and glow on active elements, reduced-motion respected.
- Layout: left rail with just **three modules** — `DASHBOARD` / `JOBS` / `ACCOUNT` — styled like an ops console; main panel; persistent bottom **Agent Console** showing SSE log lines (`[crawl] fetched 84kb`, `[llm] account=personal model=gpt-oss:120b`, `[schema] valid ✓`).
- **DASHBOARD** — stat tiles, recent activity, queue state, per-account health.
- **JOBS** — list of postings + "new job" (URL or paste). Job detail is the main workspace and holds everything about that posting in one page: pipeline stepper, extracted JD, resume match scores, and outreach (contacts / compose / sent log). No separate MATCH or OUTREACH modules.
- **ACCOUNT** — tabbed: `ollama keys` (M1), `resumes` (M3), `email (smtp)` (M4), `prompts` (M1). Everything user-owned lives here; there is no separate Settings module.
- Job status rendered as a pipeline stepper with pulsing "active" node; `needs_manual_input` lights up an amber paste terminal inline.
- Match section: heat-strip of scores per resume, expandable breakdown with matched/missing skill chips.
- Components hand-rolled with Tailwind (no MUI/shadcn look). Framer Motion optional for the stepper.

---

## 11. Deployment

**One image, one volume, zero env vars.** Everything user-specific is configured in the Settings UI and stored (encrypted where sensitive) in SQLite on the `./data` volume. There is no `.env` file.

No slim variant: Chromium adds ~600 MB to the image but removes a whole class of "why doesn't this site crawl" issues, and keeps deployment a single step. Browser fallback can be toggled off in Settings.

**Dockerfile (multi-stage)**
1. `node:22` builder: `pnpm install --frozen-lockfile`, build `shared`, `web` (Vite → `packages/web/dist`), `server` (tsup/esbuild → `packages/server/dist`).
2. Runtime: `mcr.microsoft.com/playwright:v1.x-noble` (Chromium + deps present). Copy `dist`s, production `node_modules`, and default `prompts/`. `CMD node packages/server/dist/index.js`.

**docker-compose.yml (the whole thing)**
```yaml
services:
  joboutreach:
    image: ghcr.io/<you>/joboutreach:latest
    ports: ["8787:8787"]
    volumes:
      - ./data:/data
    restart: unless-stopped
```

Quick start: `curl -O .../docker-compose.yml && docker compose up -d` → open `http://host:8787` → add an Ollama API key in Settings → done.

**What lives on the `./data` volume**
```
data/
├── app.db          # SQLite: jobs, resumes text, scores, contacts, settings, events
├── .secret         # auto-generated encryption key for API keys / SMTP password
├── resumes/        # uploaded PDF/DOCX originals
└── prompts/        # copied from image defaults on first boot; edit freely
```

**First-boot bootstrap (`config.ts`)**: create `/data` subfolders, generate `.secret` if missing, copy bundled prompts into `/data/prompts` if missing, run migrations, start listening on 8787. To change the host port, edit the left side of `ports:` in compose.

- Health endpoint `/healthz`.
- GitHub Actions: lint + test + build image on tag → GHCR (multi-arch amd64/arm64).
- Also runnable without Docker: `pnpm install && pnpm build && pnpm start` (Playwright asks to `npx playwright install chromium` once).

---

## 12. Testing

- `vitest` for server: schema round-trips, prompt loader, pipeline state machine (Ollama mocked), crawler heuristics against saved HTML fixtures (Greenhouse, Lever, LinkedIn login wall, "enable JS" page).
- One Playwright smoke test hitting a local fixture server.
- Zod schema snapshot test so any schema change is deliberate.

---

## 13. Task Board

> **This is the single source of truth for progress.** It must be updated as soon as a task is finished — see `AGENTS.md`.
> Legend: `[x]` done · `[~]` in progress · `[ ]` not started

### M0 — Scaffold `[x] complete`

- [x] pnpm workspace (`shared`, `server`, `web`) + shared `tsconfig.base.json`, `.npmrc` with `minimum-release-age`
- [x] `packages/shared`: `JobDescription`, `MatchScoreLLM`/`MatchScore`, event/dashboard schemas
- [x] `computeMatchScore()` — server-side weighted aggregation + verdict, with unit test
- [x] `packages/server`: Hono app, `/healthz`, SPA static serving with client-route fallback
- [x] Zero-env bootstrap (`config.ts`): create `data/`, generate `.secret` 0600, copy default prompts
- [x] Drizzle schema for all 10 tables + generated migration `0000`, auto-run on boot
- [x] AES-256-GCM encrypt/decrypt helper for secrets at rest
- [x] `GET /api/dashboard` aggregating the `events` table (+ integration test)
- [x] `packages/web`: Vite + React + Tailwind neon theme, 3-module rail, dashboard tiles, Agent Console shell
- [x] Default `prompts/extract_jd.md`, `prompts/score_resume.md`, `prompts/README.md`
- [x] Multi-stage Dockerfile (Node 24 builder ↔ Playwright runtime), non-root entrypoint, 7-line compose
- [x] MIT license, README, `.gitignore`/`.dockerignore`
- [x] Verified: typecheck, tests, build, `pnpm start`, `docker build` + `docker run` with volume
- [x] Nav reduced to DASHBOARD / JOBS / ACCOUNT; ACCOUNT section cards
- [x] `AGENTS.md` with the plan-update rule

### M1 — Account: Ollama keys + prompts + JD extraction `[x] complete`

- [x] `services/llm/ollamaClient.ts`: per-account client against `https://ollama.com`, Bearer auth, error mapping (auth / quota / model / network / invalid_response) with `Retry-After` parsing
- [x] `GET /api/accounts/:id/models` proxying `ollama.com/api/tags` with that key
- [x] Accounts CRUD: `POST/GET/PATCH/DELETE /api/accounts`, key encrypted, response exposes last-4 only
- [x] Default-account invariant: first key becomes default, flag moves on update, promotes a survivor on delete
- [x] `POST /api/accounts/:id/test` — 1-token chat, records `last_used_at` / `last_error`, clears quota flag on success
- [x] `services/llm/prompts.ts`: load from `data/prompts`, cache by mtime, hot reload, self-heal a missing file
- [x] `GET /api/prompts` + `POST /api/prompts/:name/reset` (re-copy bundled default)
- [x] `toOllamaFormat()` in `shared` feeding Ollama's `format` param from the same Zod schemas used for validation
- [x] `services/llm/extractJd.ts`: prompt + schema → `JobDescription`, temperature 0, input truncation, up to 3 attempts feeding validation errors back
- [x] Tests with mocked Ollama: 9 client cases (401/429/404/network/empty/format passthrough), 6 extraction cases, 3 prompt-loader cases, 13 route cases
- [x] ACCOUNT UI: keys tab (add/test/delete, default toggle, extract/score model dropdowns from live list, quota + error badges)
- [x] ACCOUNT UI: prompts tab (view + reset, edited/default badge)
- [x] Verified against real `ollama.com`: bad key maps to a 401 `auth` error and is recorded on the account

### M2 — Jobs pipeline `[x] complete`

- [x] `services/pipeline/queue.ts`: in-process FIFO, concurrency 1, resumes `queued` rows on boot
- [x] Quota pause: mark `quota_exhausted_until`, requeue job, pause queue, expose `POST /api/queue/resume` with `accountId`
- [x] `services/crawler/httpFetch.ts`: undici fetch + Readability + realistic UA, 15s timeout
- [x] `services/crawler/heuristics.ts`: content-length / login-wall / captcha / "enable JS" detection
- [x] `services/crawler/browserFetch.ts`: lazy shared Playwright Chromium, "show more" expansion, idle shutdown
- [x] ATS adapters (Greenhouse, Lever) hitting their JSON APIs before generic crawling
- [x] `POST /api/jobs` (URL) and `POST /api/jobs/manual` (pasted text) + `POST /api/jobs/:id/text` to resume from `needs_manual_input`
- [x] `runJob.ts` state machine wiring crawl → extract, writing `pipeline_logs` and `events`
- [x] `GET /api/events` SSE bus; Agent Console consumes it live
- [x] JOBS list UI (status chips, filters) and job detail: pipeline stepper, JD view, amber paste terminal
- [x] Account + model dropdown on the new-job form and on retry
- [x] Crawler tests against saved HTML fixtures (Greenhouse, Lever, LinkedIn wall, JS-only page)

### M3 — Resumes + match scoring `[ ]`

- [ ] `services/resumes/parse.ts`: PDF (`pdf-parse`) and DOCX (`mammoth`) → text
- [ ] Resume upload/list/delete routes, originals in `data/resumes/`, editable `parsed_text`
- [ ] `services/llm/scoreResume.ts`: JD JSON + resume text → `MatchScoreLLM`, then `computeMatchScore`
- [ ] `POST /api/jobs/:id/score` (one or many resumes, account + model selectable), sequential via queue
- [ ] Configurable weights persisted in `settings`, injected into prompt and aggregation
- [ ] ACCOUNT UI: resumes tab (upload, parsed-text editor, active toggle)
- [ ] Job detail: match section — score heat-strip, breakdown, matched/missing chips, tweaks
- [ ] Scoring tests with mocked Ollama + weight-change regression test

### M4 — Outreach `[ ]`

- [ ] SMTP settings (encrypted) + `POST /api/settings/smtp/test`
- [ ] `services/mailer/smtp.ts`: nodemailer wrapper, `{{placeholder}}` renderer, optional resume attachment
- [ ] Contacts CRUD per job; email template CRUD with seeded default referral template
- [ ] `POST /api/outreach/send` — single explicit send, records `outreach_emails` + `events`
- [ ] Optional "draft with AI" endpoint personalising body from JD + resume
- [ ] Job detail: contacts list, compose with live preview, sent log with errors
- [ ] Mailer tests with a stub transport

### M5 — Dashboard `[ ]`

- [ ] Time-range filter (today / 7d / 30d / all) on `/api/dashboard`
- [ ] Recent-activity feed from `events` (last 20, human-readable)
- [ ] Per-account health tiles (calls today, last error, quota badge)
- [ ] Average score, best match this week, sparkline strips
- [ ] Queue state indicator wired to the real queue

### M6 — Polish + open source `[ ]`

- [ ] Slim the image: plain `node:24` base + `playwright install --with-deps chromium` only
- [ ] Browser-fallback toggle in ACCOUNT settings
- [ ] GitHub Actions: lint + typecheck + test on PR; multi-arch image → GHCR on tag
- [ ] README screenshots + walkthrough, CONTRIBUTING, issue templates
- [ ] Manual end-to-end pass: crawl → extract → score → email on real postings

---

## 14. Decisions Log

| Topic | Decision |
|---|---|
| Auth | Deferred. Single-user homelab app for now; middleware slot reserved. |
| Quota exhaustion | Pause queue + banner with one-click "Resume with account ▾". Never auto-switch silently. |
| Default models | Extraction `gpt-oss:20b`, scoring `gpt-oss:120b`; both overridable per account and per run via dropdown populated from the account's live model list. |
| Image variants | One full image with Chromium. Browser fallback toggle lives in Settings, not env. |
| Configuration | Zero env vars, no `.env`. Single `./data` volume holds DB, secret, resumes, prompts. All config via Settings UI. |
| License | MIT |
| Dashboard | v1 with crawl/extract/score/email counters, driven by an append-only `events` table so metrics can grow without migrations. |
| Ollama client | Hand-rolled ~150-line `fetch` wrapper instead of the `ollama` npm package (M1). Only `/api/chat` and `/api/tags` are used, and owning the transport is what makes precise 401-vs-429 mapping — and therefore the quota-pause flow — possible. |
| Navigation | Only three modules: DASHBOARD, JOBS, ACCOUNT. Match and outreach live inside job detail; resumes, Ollama keys, SMTP and prompts live inside ACCOUNT. |
| ATS adapters | Greenhouse and Lever only (M2). Ashby's board API requires a token not present in the public URL, so it falls through to generic HTTP/browser crawling. Adding it later requires a URL-to-token mapping or a UI field. |
| Playwright bundling | Marked `playwright` and `playwright-core` as `external` in tsup (M2). The bundler can't resolve playwright's dynamic `require` calls for `chromium-bidi`; keeping it external means the runtime image's `node_modules` provides it at runtime, same as `better-sqlite3`. |
