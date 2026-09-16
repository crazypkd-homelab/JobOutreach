import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import type { AccountView, JobView } from "@joboutreach/shared";
import { FREE_MODELS, modelLabel } from "@joboutreach/shared";
import { api, ApiRequestError } from "../../api/client";
import { Banner, Field, NeonButton, Select, TextInput } from "../../components/ui";
import { StatusChip } from "./StatusChip";
import { MatchPanel, ScoreMatchForm } from "./MatchPanel";

const STEPS = [
  { label: "Crawl", done: ["needs_manual_input", "extracting", "extracted"] as const, active: ["crawling"] as const },
  { label: "Extract", done: ["extracted"] as const, active: ["extracting"] as const },
  { label: "Match", done: [] as const, active: [] as const },
  { label: "Outreach", done: [] as const, active: [] as const },
] as const;

function Stepper({ status, hasMatch }: { status: JobView["status"]; hasMatch?: boolean }) {
  return (
    <div className="inline-flex flex-col gap-1">
      {/* Circle + line row — all items vertically centered on the circle */}
      <div className="flex items-center">
        {STEPS.map((step, i) => {
          const isDone = (step.done as readonly string[]).includes(status) || (step.label === "Match" && !!hasMatch);
          const isActive = (step.active as readonly string[]).includes(status) || (step.label === "Outreach" && !!hasMatch);
          const isFailed = status === "failed" && (i === 0 ? ["crawling"].includes(status) : i === 1 && ["extracting"].includes(status));

          const circleColor = isDone
            ? "border-neon-lime bg-neon-lime/20 text-neon-lime"
            : isActive
              ? status === "failed"
                ? "border-neon-red text-neon-red animate-pulseGlow"
                : "border-neon-cyan text-neon-cyan animate-pulseGlow"
              : isFailed
                ? "border-neon-red text-neon-red"
                : "border-grid text-slate-700";

          const lineColor = isDone ? "bg-neon-lime/40" : "bg-grid";

          return (
            <div key={step.label} className="flex items-center">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${circleColor}`}>
                {isDone && <span className="w-1.5 h-1.5 rounded-full bg-neon-lime" />}
                {isActive && <span className={`w-1.5 h-1.5 rounded-full ${status === "failed" ? "bg-neon-red" : "bg-neon-cyan"} animate-pulseGlow`} />}
              </div>
              {i < STEPS.length - 1 && <div className={`h-px w-16 ${lineColor}`} />}
            </div>
          );
        })}
      </div>
      {/* Labels row — aligned under each circle */}
      <div className="flex items-center">
        {STEPS.map((step, i) => {
          const isDone = (step.done as readonly string[]).includes(status) || (step.label === "Match" && !!hasMatch);
          const isActive = (step.active as readonly string[]).includes(status) || (step.label === "Outreach" && !!hasMatch);
          return (
            <div key={step.label} className="flex items-center">
              <span className={`w-4 text-center text-[10px] uppercase tracking-[0.15em] ${isDone ? "text-neon-lime" : isActive ? "text-neon-cyan" : "text-slate-700"}`}>
                {step.label}
              </span>
              {i < STEPS.length - 1 && <div className="w-16" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JdView({ jd }: { jd: NonNullable<JobView["jd"]> }) {
  return (
    <div className="panel p-4 space-y-4">
      <div className="panel-title">extracted job description</div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div><span className="text-slate-600">title:</span> <span className="text-slate-200">{jd.title}</span></div>
        <div><span className="text-slate-600">company:</span> <span className="text-slate-200">{jd.company}</span></div>
        <div><span className="text-slate-600">location:</span> <span className="text-slate-200">{jd.location ?? "—"}</span></div>
        <div><span className="text-slate-600">work mode:</span> <span className="text-slate-200">{jd.work_mode}</span></div>
        <div><span className="text-slate-600">employment:</span> <span className="text-slate-200">{jd.employment_type}</span></div>
        <div><span className="text-slate-600">seniority:</span> <span className="text-slate-200">{jd.seniority}</span></div>
        <div><span className="text-slate-600">min years exp:</span> <span className="text-slate-200">{jd.years_experience_min ?? "—"}</span></div>
        <div>
          <span className="text-slate-600">salary:</span>{" "}
          <span className="text-slate-200">
            {jd.salary.min ?? "?"} – {jd.salary.max ?? "?"}
            {jd.salary.currency ? ` ${jd.salary.currency}` : ""}
            {jd.salary.period ? `/${jd.salary.period}` : ""}
          </span>
        </div>
      </div>

      {jd.summary && (
        <div>
          <div className="panel-title mb-1">summary</div>
          <p className="text-xs text-slate-300 leading-relaxed">{jd.summary}</p>
        </div>
      )}

      {jd.responsibilities.length > 0 && (
        <div>
          <div className="panel-title mb-1">responsibilities</div>
          <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
            {jd.responsibilities.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {jd.required_skills.length > 0 && (
          <div>
            <div className="panel-title mb-1">required skills</div>
            <div className="flex flex-wrap gap-1">
              {jd.required_skills.map((s) => (
                <span key={s} className="px-1.5 py-0.5 text-[10px] border border-neon-cyan/40 text-neon-cyan rounded-sm">{s}</span>
              ))}
            </div>
          </div>
        )}
        {jd.preferred_skills.length > 0 && (
          <div>
            <div className="panel-title mb-1">preferred skills</div>
            <div className="flex flex-wrap gap-1">
              {jd.preferred_skills.map((s) => (
                <span key={s} className="px-1.5 py-0.5 text-[10px] border border-neon-magenta/40 text-neon-magenta rounded-sm">{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {jd.keywords.length > 0 && (
        <div>
          <div className="panel-title mb-1">keywords</div>
          <div className="flex flex-wrap gap-1">
            {jd.keywords.map((k) => (
              <span key={k} className="px-1.5 py-0.5 text-[10px] border border-grid text-slate-500 rounded-sm">{k}</span>
            ))}
          </div>
        </div>
      )}

      {jd.education && (
        <div><span className="panel-title">education: </span><span className="text-xs text-slate-300">{jd.education}</span></div>
      )}
    </div>
  );
}

function PasteTerminal({ job, onResumed }: { job: JobView; onResumed: () => void }) {
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [text, setText] = useState(job.failureReason ? "" : "");
  const [accountId, setAccountId] = useState<number | null>(job.ollamaAccountId);
  const [model, setModel] = useState(job.modelUsed ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.accounts.list().then((list) => {
      setAccounts(list);
      if (accountId === null) {
        const healthy = list.filter((a) => !a.quotaExhausted);
        const pick = healthy[0] ?? list[0];
        if (pick) { setAccountId(pick.id); setModel(pick.extractModel); }
      }
    }).catch(() => {});
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.jobs.resumeWithText(job.id, { text: text.trim(), accountId: accountId!, model: model || undefined });
      setText("");
      onResumed();
    } catch (e) {
      setError((e as ApiRequestError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel p-4 space-y-3 border-neon-amber/30">
      <div className="flex items-center gap-2">
        <span className="text-neon-amber animate-blink">▍</span>
        <span className="panel-title text-neon-amber">manual paste required</span>
      </div>
      <p className="text-xs text-slate-400">
        The crawler couldn't extract this page ({job.failureReason}). Paste the job posting text below to resume at extraction.
      </p>
      <Field label="posting text" hint="min 100 chars">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="mt-1 w-full bg-void border border-neon-amber/20 rounded-sm px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-neon-amber/60 placeholder:text-slate-700 font-mono"
          placeholder="Paste the full job posting text here…"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="account">
          <Select value={accountId ?? ""} onChange={(e) => setAccountId(Number(e.target.value))}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id} disabled={a.quotaExhausted}>
                {a.label} {a.quotaExhausted ? "(quota spent)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="model">
          <Select value={model} onChange={(e) => setModel(e.target.value)}>
            {[...new Set([model, ...FREE_MODELS])].filter(Boolean).map((m) => (
              <option key={m} value={m}>{modelLabel(m)}</option>
            ))}
          </Select>
        </Field>
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      <NeonButton variant="lime" onClick={submit} disabled={busy || text.trim().length < 100 || accountId === null}>
        {busy ? "resuming…" : "resume extraction"}
      </NeonButton>
    </div>
  );
}

function RetryPanel({ job, onRetried }: { job: JobView; onRetried: () => void }) {
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [accountId, setAccountId] = useState<number | null>(job.ollamaAccountId);
  const [model, setModel] = useState(job.modelUsed ?? "gpt-oss:20b");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.accounts.list().then(setAccounts).catch(() => {});
  }, []);

  const retry = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.jobs.retry(job.id, { accountId: accountId!, model: model || undefined });
      onRetried();
    } catch (e) {
      setError((e as ApiRequestError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel p-4 space-y-3 border-neon-red/30">
      <div className="panel-title text-neon-red">extraction failed</div>
      <p className="text-xs text-slate-400">{job.failureReason}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="account">
          <Select value={accountId ?? ""} onChange={(e) => setAccountId(Number(e.target.value))}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id} disabled={a.quotaExhausted}>
                {a.label} {a.quotaExhausted ? "(quota spent)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="model">
          <Select value={model} onChange={(e) => setModel(e.target.value)}>
            {[...new Set([model, ...FREE_MODELS])].filter(Boolean).map((m) => (
              <option key={m} value={m}>{modelLabel(m)}</option>
            ))}
          </Select>
        </Field>
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      <NeonButton variant="cyan" onClick={retry} disabled={busy || accountId === null}>
        {busy ? "retrying…" : "retry"}
      </NeonButton>
    </div>
  );
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const jobId = Number(id);
  const navigate = useNavigate();
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scoreCount, setScoreCount] = useState(0);
  const [hasMatch, setHasMatch] = useState(false);

  const load = () => {
    if (Number.isInteger(jobId) && jobId > 0) {
      api.jobs.get(jobId).then(setJob).catch((e: Error) => setError(e.message));
    }
  };

  useEffect(() => {
    load();
  }, [jobId]);

  // Poll while the job is active.
  useEffect(() => {
    if (!job) return;
    if (!["queued", "crawling", "extracting"].includes(job.status)) return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [job]);

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!job) return <div className="text-xs text-slate-600 animate-pulseGlow">loading job…</div>;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/jobs" className="text-[10px] text-slate-600 hover:text-slate-400">← back to jobs</Link>
      </div>

      <header>
        <div className="flex items-center gap-3">
          <StatusChip status={job.status} />
          <h1 className="text-xl neon-text-cyan tracking-widest">{job.title ?? "untitled job"}</h1>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {job.company ?? "unknown company"}{job.location ? ` · ${job.location}` : ""}
          {job.sourceUrl ? <><br /><a href={job.sourceUrl} target="_blank" rel="noopener" className="text-neon-cyan/70 hover:text-neon-cyan break-all">{job.sourceUrl}</a></> : " · manual paste"}
        </div>
      </header>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Stepper status={job.status} hasMatch={hasMatch} />
        {hasMatch && (
          <NeonButton variant="lime" onClick={() => navigate(`/jobs/${job.id}/outreach`)}>
            outreach
          </NeonButton>
        )}
      </div>

      {job.status === "needs_manual_input" && <PasteTerminal job={job} onResumed={load} />}
      {job.status === "failed" && <RetryPanel job={job} onRetried={load} />}
      {job.jd && (
        <div className="panel p-4">
          <ScoreMatchForm
            jobId={job.id}
            onScore={() => {
              setScoreCount((c) => c + 1);
              setHasMatch(true);
            }}
          />
        </div>
      )}
      {job.jd && <JdView jd={job.jd} />}

      {job.status === "extracted" && (
        <MatchPanel
          jobId={job.id}
          refreshKey={scoreCount}
          onMatchCount={(count) => setHasMatch(count > 0)}
        />
      )}
    </div>
  );
}
