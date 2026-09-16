import { useEffect, useState } from "react";
import type { AccountView, JobView } from "@joboutreach/shared";
import { FREE_MODELS, modelLabel } from "@joboutreach/shared";
import { api, ApiRequestError } from "../../api/client";
import { Banner, Field, NeonButton, Select, TextInput } from "../../components/ui";

type Mode = "url" | "paste";

export function NewJobForm({ onCreated, disabled }: { onCreated: (job: JobView) => void; disabled?: boolean }) {
  const [accounts, setAccounts] = useState<AccountView[] | null>(null);
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([...FREE_MODELS]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.accounts.list().then((list) => {
      setAccounts(list);
      const healthy = list.filter((a) => !a.quotaExhausted);
      const pick = healthy[0] ?? list[0];
      if (pick) {
        setAccountId(pick.id);
        setModel(pick.extractModel);
      }
    }).catch((e: Error) => setError(e.message));
  }, []);

  // Load models when account changes.
  useEffect(() => {
    if (accountId === null) return;
    api.accounts.models(accountId).then((list) => {
      const names = list.map((m) => m.name);
      setModels(names.length ? [...new Set([...names, ...FREE_MODELS])] : [...FREE_MODELS]);
    }).catch(() => setModels([...FREE_MODELS]));
  }, [accountId]);

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!accounts) return <div className="text-xs text-slate-600 animate-pulseGlow">loading accounts…</div>;
  if (accounts.length === 0) {
    return <div className="panel p-4 text-xs text-slate-500">add an Ollama API key in ACCOUNT first to create jobs.</div>;
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const job =
        mode === "url"
          ? await api.jobs.create({ sourceUrl: url.trim(), accountId: accountId!, model: model || undefined })
          : await api.jobs.createManual({ text: text.trim(), accountId: accountId!, model: model || undefined, sourceUrl: url.trim() || "" });
      setUrl("");
      setText("");
      onCreated(job);
    } catch (e) {
      const err = e as ApiRequestError;
      const hint = err.kind === "quota" ? " — this account is out of quota, pick another"
        : err.kind === "payment" ? " — select a free model (marked \"free\" in the dropdown)"
        : "";
      setError(`${err.message}${hint}`);
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = mode === "url" ? url.trim().length > 0 : text.trim().length >= 100;

  if (disabled) {
    return (
      <div className="panel p-4 space-y-3">
        <div className="panel-title">new job</div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-blink" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-blink" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-blink" style={{ animationDelay: "300ms" }} />
          </span>
          pipeline busy
        </div>
      </div>
    );
  }

  return (
    <div className="panel p-4 space-y-4">
      <div className="panel-title">new job</div>

      <div className="flex gap-1">
        {(["url", "paste"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={[
              "px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] border rounded-sm transition-colors",
              m === mode ? "border-neon-cyan/60 text-neon-cyan bg-neon-cyan/5" : "border-grid text-slate-500 hover:text-slate-300",
            ].join(" ")}
          >
            {m === "url" ? "from URL" : "paste text"}
          </button>
        ))}
      </div>

      {mode === "url" ? (
        <Field label="job posting URL" hint="greenhouse, lever, or any public posting page">
          <TextInput
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://boards.greenhouse.io/example/jobs/123"
            type="url"
          />
        </Field>
      ) : (
        <>
          <Field label="posting URL (optional)" hint="kept for reference — crawling is skipped on paste">
            <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" type="url" />
          </Field>
          <Field label="paste the job posting text" hint="min 100 chars — skip the crawl and go straight to extraction">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              className="mt-1 w-full bg-void border border-grid rounded-sm px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-neon-cyan/70 focus:shadow-neon-cyan/50 placeholder:text-slate-700 font-mono"
              placeholder="Paste the full job posting text here…"
            />
          </Field>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="ollama account">
          <Select value={accountId ?? ""} onChange={(e) => { setAccountId(Number(e.target.value)); const a = accounts.find((x) => x.id === Number(e.target.value)); if (a) setModel(a.extractModel); }}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id} disabled={a.quotaExhausted}>
                {a.label} {a.quotaExhausted ? "(quota spent)" : ""} {a.isDefault ? "· default" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="model" hint="defaults to the account's extract model">
          <Select value={model} onChange={(e) => setModel(e.target.value)}>
            {[...new Set([model, ...models])].filter(Boolean).map((m) => (
              <option key={m} value={m}>{modelLabel(m)}</option>
            ))}
          </Select>
        </Field>
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      <NeonButton onClick={submit} disabled={busy || !canSubmit || accountId === null}>
        {busy ? "creating…" : "crawl & extract"}
      </NeonButton>
    </div>
  );
}
