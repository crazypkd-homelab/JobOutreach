import { useEffect, useState } from "react";
import type { AccountView } from "@joboutreach/shared";
import { api, ApiRequestError } from "../../api/client";
import { Banner, Chip, Field, NeonButton, TextInput } from "../../components/ui";

function AccountCard({ account, onChanged }: { account: AccountView; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(account.label);
  const [apiKey, setApiKey] = useState("");
  const [result, setResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setResult(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      const err = e as ApiRequestError;
      const hint =
        err.kind === "quota" ? " — switch to another account or wait for the limit to reset" : err.kind === "auth" ? " — check the key" : "";
      setResult({ tone: "error", text: `${err.message}${hint}` });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const patch: { label?: string; apiKey?: string } = {};
    if (label.trim() && label.trim() !== account.label) patch.label = label.trim();
    if (apiKey.trim()) patch.apiKey = apiKey.trim();
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    setBusy("save");
    setResult(null);
    try {
      await api.accounts.update(account.id, patch);
      setApiKey("");
      setEditing(false);
      onChanged();
    } catch (e) {
      const err = e as ApiRequestError;
      setResult({ tone: "error", text: err.message });
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
          {!editing && (
            <NeonButton variant="ghost" disabled={busy !== null} onClick={() => { setLabel(account.label); setEditing(true); }}>
              edit
            </NeonButton>
          )}
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

      {editing && (
        <div className="space-y-3 pt-2 border-t border-grid">
          <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
            <Field label="label">
              <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="personal" />
            </Field>
            <Field label="new api key" hint="leave blank to keep the current key">
              <TextInput
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
                autoComplete="off"
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <NeonButton variant="cyan" disabled={busy !== null} onClick={save}>
              {busy === "save" ? "saving…" : "save"}
            </NeonButton>
            <NeonButton
              variant="ghost"
              disabled={busy !== null}
              onClick={() => { setEditing(false); setLabel(account.label); setApiKey(""); setResult(null); }}
            >
              cancel
            </NeonButton>
          </div>
        </div>
      )}

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
      <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
        <Field label="label">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="personal" />
        </Field>
        <Field label="api key">
          <TextInput type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" autoComplete="off" />
        </Field>
        <div className="flex items-end">
          <NeonButton onClick={submit} disabled={busy || label.trim().length === 0 || apiKey.trim().length < 1}>
            {busy ? "adding…" : "add"}
          </NeonButton>
        </div>
      </div>
      <p className="text-[10px] text-slate-600">from ollama.com/settings/keys — stored encrypted, never shown again</p>
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
