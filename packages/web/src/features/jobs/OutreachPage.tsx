import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { AccountView, JobView, ResumeView } from "@joboutreach/shared";
import { api, ApiRequestError } from "../../api/client";
import { Banner, Field, NeonButton, Select, TextInput } from "../../components/ui";

const FALLBACK_MODELS = ["gpt-oss:120b", "gpt-oss:20b"];

export function OutreachPage() {
  const { id } = useParams<{ id: string }>();
  const jobId = Number(id);

  const [job, setJob] = useState<JobView | null>(null);
  const [resumes, setResumes] = useState<ResumeView[] | null>(null);
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [resumeId, setResumeId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [model, setModel] = useState("gpt-oss:120b");
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS);
  const [busy, setBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!Number.isInteger(jobId) || jobId <= 0) return;
    api.jobs.get(jobId).then(setJob).catch((e: Error) => setError(e.message));
    api.resumes.list().then((list) => {
      setResumes(list);
      const active = list.filter((r) => r.isActive);
      if (active[0]) setResumeId(active[0].id);
    }).catch((e: Error) => setError(e.message));
    api.accounts.list().then((list) => {
      setAccounts(list);
      const healthy = list.filter((a) => !a.quotaExhausted);
      const pick = healthy[0] ?? list[0];
      if (pick) {
        setAccountId(pick.id);
        const score = pick.scoreModel || "gpt-oss:120b";
        setModel(score);
        setModels([...new Set([score, ...FALLBACK_MODELS])]);
      }
    }).catch((e: Error) => setError(e.message));
  }, [jobId]);

  const handleAccountChange = (nextId: number) => {
    setAccountId(nextId);
    const a = accounts.find((x) => x.id === nextId);
    if (a) {
      const score = a.scoreModel || "gpt-oss:120b";
      setModel(score);
      setModels([...new Set([score, ...FALLBACK_MODELS])]);
    }
  };

  const draft = async () => {
    if (resumeId === null || accountId === null) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const draft = await api.jobs.draftOutreach(jobId, {
        resumeId,
        accountId,
        model: model || undefined,
        recipient: to.trim() || undefined,
      });
      setSubject(draft.subject);
      setBody(draft.body);
    } catch (e) {
      const err = e as ApiRequestError;
      setError(`${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!to.trim() || !subject.trim() || !body.trim()) return;
    setSendBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.jobs.sendOutreach(jobId, {
        to: to.trim(),
        subject,
        body,
        resumeId: resumeId ?? undefined,
      });
      setResult({ tone: "ok", text: `Email sent at ${new Date(res.sentAt).toLocaleString()}.` });
    } catch (e) {
      const err = e as ApiRequestError;
      setResult({ tone: "error", text: err.message });
    } finally {
      setSendBusy(false);
    }
  };

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!job) return <div className="text-xs text-slate-600 animate-pulseGlow">loading job…</div>;
  if (!job.jd) return <Banner tone="error">This job has not been extracted yet.</Banner>;

  const activeResumes = (resumes ?? []).filter((r) => r.isActive);

  return (
    <div className="space-y-5">
      <header>
        <Link to={`/jobs/${jobId}`} className="text-[10px] text-slate-600 hover:text-slate-400">← back to job</Link>
        <div className="panel-title mt-4">module 01-reach</div>
        <h1 className="text-xl neon-text-cyan tracking-widest">JOBREACHOUT</h1>
        <p className="mt-2 text-xs text-slate-500">
          {job.title ?? "untitled"} · {job.company ?? "unknown company"}
        </p>
      </header>

      <div className="panel p-4 space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="to">
            <TextInput
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recruiter@company.com"
              autoComplete="off"
            />
          </Field>
          <Field label="subject">
            <TextInput
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Referral request for..."
              autoComplete="off"
            />
          </Field>
        </div>

        <Field label="body">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            placeholder="Write your email here, or click AI draft to generate one."
            className="mt-1 w-full bg-void border border-neon-cyan/20 rounded-sm px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-neon-cyan/60 placeholder:text-slate-700"
          />
        </Field>

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="attach resume">
            <Select value={resumeId ?? ""} onChange={(e) => setResumeId(Number(e.target.value))}>
              {activeResumes.length === 0 && <option value="">no active resumes</option>}
              {activeResumes.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="account">
            <Select value={accountId ?? ""} onChange={(e) => handleAccountChange(Number(e.target.value))}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id} disabled={a.quotaExhausted}>
                  {a.label} {a.quotaExhausted ? "(quota spent)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="model">
            <Select value={model} onChange={(e) => setModel(e.target.value)}>
              {[...new Set([model, ...models])].filter(Boolean).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex items-center gap-3">
          <NeonButton variant="cyan" onClick={draft} disabled={busy || sendBusy || resumeId === null || accountId === null}>
            {busy ? "drafting…" : "ai draft"}
          </NeonButton>
          <NeonButton
            variant="lime"
            onClick={() => void send()}
            disabled={sendBusy || busy || !to.trim() || !subject.trim() || !body.trim()}
          >
            {sendBusy ? "sending…" : "send"}
          </NeonButton>
          <span className="text-[10px] text-slate-600">
            {busy ? "drafting…" : "ai draft writes from resume + JD · send delivers via SMTP with resume attached"}
          </span>
        </div>

        {result && <Banner tone={result.tone}>{result.text}</Banner>}
      </div>
    </div>
  );
}
