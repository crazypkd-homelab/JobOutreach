# Job Outreach

Self-hosted job-outreach assistant. Paste a job URL, let Ollama Cloud extract a structured job description, score your resumes against it, and send referral-request emails — all from a single container with a neon agent-console UI.

> Status: early development. See [plan.md](plan.md) for the roadmap.

## Run it

```bash
curl -O https://raw.githubusercontent.com/dharun/JobOutreach/main/docker-compose.yml
docker compose up -d
```

Open <http://localhost:8787>, add your Ollama API key under **Accounts**, and you're set. No env vars, no `.env` file. Everything lives in `./data/`:

```
data/
├── app.db      # SQLite: jobs, scores, contacts, settings, events
├── .secret     # auto-generated key that encrypts API keys / SMTP password
├── resumes/    # uploaded originals
└── prompts/    # editable LLM prompts (copied from defaults on first boot)
```

Back up that folder and you've backed up everything.

## Develop

Requires Node 22 and pnpm 10.

```bash
pnpm install
pnpm dev          # server on :8787 (tsx watch) + Vite on :5173 with API proxy
pnpm test
pnpm build        # shared -> web -> server
pnpm start        # serve the built SPA + API on :8787
```

Database schema lives in `packages/server/src/db/schema.ts`; after changing it run `pnpm --filter @joboutreach/server db:generate` to create a migration. Migrations run automatically on boot.

## Layout

```
packages/shared   Zod schemas shared by server and web (LLM output contracts)
packages/server   Hono API, SQLite via Drizzle, pipeline, crawler, mailer
packages/web      React + Vite + Tailwind SPA (served by the server in prod)
prompts/          Default system prompts for extraction and scoring
```

## License

[PolyForm Noncommercial License 1.0.0](LICENSE) — free to use, modify, and build on, but not for commercial use. Contributions welcome!
