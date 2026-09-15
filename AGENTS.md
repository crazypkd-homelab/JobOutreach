# JobOutreach — Project Rules

## Keep the plan in sync

`plan.md` §13 "Task Board" is the single source of truth for progress.

- **After completing any task, immediately update its checkbox in `plan.md` §13** — `[ ]` → `[x]` (use `[~]` while a task is mid-flight).
- When every task in a milestone is `[x]`, mark the milestone heading `[x] complete`.
- If work reveals a task that isn't listed, add it to the relevant milestone rather than leaving it undocumented.
- If an implementation decision diverges from the plan, update the affected plan section and add a row to §14 "Decisions Log" in the same change.
- Do this as part of the same task, not as a batched cleanup later.

## Stack conventions

- pnpm workspace, Node 22+, TypeScript everywhere. Never use npm or yarn.
- Zod schemas in `packages/shared` are the contract for LLM output — they generate the JSON Schema sent to Ollama and validate the response. Change them there, never duplicate.
- LLM prompts live in `prompts/` (copied to `data/prompts/` at runtime). Never hardcode prompt text in TypeScript.
- **Zero env vars.** All configuration is user-set via the UI and stored in SQLite under `data/`. Do not introduce `.env` files or `process.env` reads for configuration.
- Database changes: edit `packages/server/src/db/schema.ts`, then `pnpm --filter @joboutreach/server db:generate`. Never hand-write migration SQL.

## Verification before calling a task done

```bash
pnpm typecheck && pnpm test && pnpm build
```

For changes touching Docker or the boot sequence, also verify `docker build` and a `docker run` with a `./data` volume.
