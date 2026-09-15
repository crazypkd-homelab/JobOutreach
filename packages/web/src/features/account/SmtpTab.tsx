import { useEffect, useState } from "react";
import type { SmtpSettingsView } from "@joboutreach/shared";
import { api, ApiRequestError } from "../../api/client";
import { Banner, Field, NeonButton, Select, TextInput } from "../../components/ui";

const EMPTY = {
  host: "",
  port: 587,
  secure: false,
  user: "",
  password: "",
  fromName: "",
  fromEmail: "",
};

export function SmtpTab() {
  const [view, setView] = useState<SmtpSettingsView | null | undefined>(undefined);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = () =>
    api.smtp
      .get()
      .then((v) => {
        setView(v);
        if (v) setForm((f) => ({ ...f, host: v.host, port: v.port, secure: v.secure, user: v.user, fromName: v.fromName, fromEmail: v.fromEmail }));
      })
      .catch((e: ApiRequestError) => {
        if (e.status === 404) setView(null);
        else setView(undefined);
      });

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setBusy(true);
    setResult(null);
    try {
      const v = await api.smtp.save(form);
      setView(v);
      setForm((f) => ({ ...f, password: "" }));
      setResult({ tone: "ok", text: "SMTP settings saved (encrypted)." });
    } catch (e) {
      setResult({ tone: "error", text: (e as ApiRequestError).message });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setResult(null);
    try {
      await api.smtp.test();
      setResult({ tone: "ok", text: "SMTP connection verified." });
    } catch (e) {
      setResult({ tone: "error", text: (e as ApiRequestError).message });
    } finally {
      setBusy(false);
    }
  };

  if (view === undefined) return <div className="text-xs text-slate-600 animate-pulseGlow">loading smtp settings…</div>;

  return (
    <div className="space-y-3">
      <div className="panel p-4 space-y-3">
        <div className="panel-title">{view ? "smtp configuration" : "configure smtp"}</div>
        {view && (
          <div className="text-[10px] text-slate-600">
            last saved {new Date(view.updatedAt).toLocaleString()} · password stored encrypted {view.hasPassword ? "(set)" : "(missing)"}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="host">
            <TextInput value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="smtp.gmail.com" autoComplete="off" />
          </Field>
          <Field label="port">
            <TextInput
              type="number"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
              placeholder="587"
              autoComplete="off"
            />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="security">
            <Select value={form.secure ? "tls" : "starttls"} onChange={(e) => setForm({ ...form, secure: e.target.value === "tls" })}>
              <option value="starttls">STARTTLS (587)</option>
              <option value="tls">TLS / SSL (465)</option>
            </Select>
          </Field>
          <Field label="username">
            <TextInput value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} placeholder="you@gmail.com" autoComplete="off" />
          </Field>
        </div>
        <Field label="password" hint={view?.hasPassword ? "leave blank to keep the stored password" : "app password for Gmail / your SMTP provider"}>
          <TextInput
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••"
            autoComplete="off"
          />
        </Field>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="from name">
            <TextInput value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} placeholder="Your Name" autoComplete="off" />
          </Field>
          <Field label="from email">
            <TextInput
              type="email"
              value={form.fromEmail}
              onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
              placeholder="you@gmail.com"
              autoComplete="off"
            />
          </Field>
        </div>
        <div className="flex gap-2">
          <NeonButton
            variant="cyan"
            disabled={busy || !form.host || !form.user || !form.fromEmail || (!form.password && !view?.hasPassword)}
            onClick={save}
          >
            {busy ? "saving…" : "save"}
          </NeonButton>
          <NeonButton variant="lime" disabled={busy || !view} onClick={test}>
            {busy ? "testing…" : "test connection"}
          </NeonButton>
        </div>
        {result && <Banner tone={result.tone}>{result.text}</Banner>}
      </div>
      <p className="text-[10px] text-slate-600">
        For Gmail, use an <span className="text-slate-400">app password</span> (not your account password) from myaccount.google.com → Security → 2-Step Verification → App passwords.
      </p>
    </div>
  );
}
