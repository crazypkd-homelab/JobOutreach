import { useEffect, useState } from "react";
import type { AccountView } from "@joboutreach/shared";
import { api, ApiRequestError } from "../../api/client";
import { Banner, Chip, Field, NeonButton, Select, TextInput } from "../../components/ui";

const FALLBACK_MODELS = ["gpt-oss:20b", "gpt-oss:120b"];

function useModels(accountId: number | null) {
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accountId === null) return;
    api.accounts
      .models(accountId)
      .then((list) => {
        // Keep the defaults selectable even if the live list is unexpectedly empty.
        const names = list.map((m) => m.name);
        setModels(names.length ? [...new Set([...names, ...FALLBACK_MODELS])] : FALLBACK_MODELS);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [accountId]);

  return { models, error };
}

function AccountCard({ account, onChanged }: { account: AccountView; onChanged: () => void }) {
  const { models, error: modelsError } = useModels(account.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setResult(null);
    try {
      await fn();
      onChanged();
      if (label === "test") setResult({ tone: "ok", text: "key works" });
    } catch (e) {
      const err = e as ApiRequestError;
      const hint =
        err.kind === "quota" ? " — switch to another account or wait for the limit to reset" : err.kind === "auth" ? " — check the key" : "";
      setResult({ tone: "error", text: `${err.message}${hint}` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm tracking-widest text-slate-200">{account.label}</span>
            {account.isDefault && <Chip tone="lime">default</Chip>}
            {account.quotaExhausted && <Chip tone="amber">quota spent</Chip>}
          </div>
          <div className="mt-1 text-[10px] text-slate-600">
            key {account.keyHint}
            {account.lastUsedAt && ` · last used ${new Date(account.lastUsedAt).toLocaleString()}`}
          </div>
        </div>
        <div className="flex gap-2">
          <NeonButton variant="lime" disabled={busy !== null} onClick={() => run("test", () => api.accounts.test(account.id))}>
            {busy === "test" ? "testing…" : "test"}
          </NeonButton>
          {!account.isDefault && (
            <NeonButton variant="ghost" disabled={busy !== null} onClick={() => run("default", () => api.accounts.update(account.id, { isDefault: true }))}>
              make default
            </NeonButton>
          )}
          <NeonButton variant="danger" disabled={busy !== null} onClick={() => run("delete", () => api.accounts.remove(account.id))}>
            delete
          </NeonButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="extract model" hint="used for JD extraction — cheaper is fine">
          <Select
            value={account.extractModel}
            onChange={(e) => run("extract", () => api.accounts.update(account.id, { extractModel: e.target.value }))}
          >
            {[...new Set([account.extractModel, ...models])].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="score model" hint="used for resume scoring — better judgement">
          <Select
            value={account.scoreModel}
            onChange={(e) => run("score", () => api.accounts.update(account.id, { scoreModel: e.target.value }))}
          >
            {[...new Set([account.scoreModel, ...models])].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {modelsError && <div className="text-[10px] text-neon-amber">could not load model list: {modelsError}</div>}
      {result && <Banner tone={result.tone}>{result.text}</Banner>}
      {!result && account.lastError && <div className="text-[10px] text-neon-red/80">last error: {account.lastError}</div>}
    </div>
  );
}

function AddAccountForm({ onAdded }: { onAdded: () => void }) {
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.accounts.create({ label: label.trim(), apiKey: apiKey.trim() });
      setLabel("");
      setApiKey("");
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel p-4 space-y-3">
      <div className="panel-title">add ollama account</div>
      <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end">
        <Field label="label">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="personal" />
        </Field>
        <Field label="api key" hint="from ollama.com/settings/keys — stored encrypted, never shown again">
          <TextInput type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" autoComplete="off" />
        </Field>
        <NeonButton onClick={submit} disabled={busy || label.trim().length === 0 || apiKey.trim().length < 10}>
          {busy ? "adding…" : "add"}
        </NeonButton>
      </div>
      {error && <Banner tone="error">{error}</Banner>}
    </div>
  );
}

export function OllamaKeysTab() {
  const [accounts, setAccounts] = useState<AccountView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api.accounts
      .list()
      .then(setAccounts)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void load();
  }, []);

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!accounts) return <div className="text-xs text-slate-600 animate-pulseGlow">loading accounts…</div>;

  return (
    <div className="space-y-3">
      <AddAccountForm onAdded={load} />
      {accounts.length === 0 ? (
        <div className="panel p-4 text-xs text-slate-500">
          no accounts yet. add an Ollama Cloud API key to enable crawling and scoring.
        </div>
      ) : (
        accounts.map((a) => <AccountCard key={a.id} account={a} onChanged={load} />)
      )}
    </div>
  );
}
