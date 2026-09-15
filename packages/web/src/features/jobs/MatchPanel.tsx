import { useEffect, useRef, useState } from "react";
import type { AccountView, MatchScoreView, ResumeView } from "@joboutreach/shared";
import { api, ApiRequestError } from "../../api/client";
import { Banner, Field, NeonButton, Select } from "../../components/ui";

const FALLBACK_MODELS = ["gpt-oss:20b", "gpt-oss:120b"];

const VERDICT_COLORS: Record<string, string> = {
  strong: "text-neon-lime border-neon-lime/40",
  good: "text-neon-cyan border-neon-cyan/40",
  weak: "text-neon-amber border-neon-amber/40",
  poor: "text-neon-red border-neon-red/40",
};

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 75 ? "bg-neon-lime" : score >= 50 ? "bg-neon-cyan" : score >= 30 ? "bg-neon-amber" : "bg-neon-red";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 w-28 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-void border border-grid rounded-sm overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-slate-300 w-8 text-right">{score}</span>
    </div>
  );
}

function MatchResult({ match, onDelete }: { match: MatchScoreView; onDelete: () => void }) {
  const s = match.score;
  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm tracking-widest text-slate-200">{match.resumeName}</span>
            <span className={`px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] border rounded-sm ${VERDICT_COLORS[s.verdict] ?? "text-slate-500 border-grid"}`}>
              {s.verdict}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-slate-600">
            {match.modelUsed ?? "unknown model"} · {new Date(match.createdAt).toLocaleString()}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-2xl tabular-nums text-neon-cyan">{s.overall}</div>
            <div className="text-[9px] text-slate-600 uppercase tracking-widest">overall</div>
          </div>
          <NeonButton variant="ghost" onClick={onDelete}>×</NeonButton>
        </div>
      </div>

      <div className="space-y-1.5 pt-2 border-t border-grid">
        <ScoreBar label="required skills" score={s.breakdown.required_skills.score} />
        <ScoreBar label="preferred skills" score={s.breakdown.preferred_skills.score} />
        <ScoreBar label="experience" score={s.breakdown.experience.score} />
        <ScoreBar label="domain fit" score={s.breakdown.domain_fit.score} />
        <ScoreBar label="education" score={s.breakdown.education.score} />
      </div>

      {s.breakdown.required_skills.matched.length > 0 && (
        <div>
          <div className="panel-title mb-1">matched skills</div>
          <div className="flex flex-wrap gap-1">
            {s.breakdown.required_skills.matched.map((sk) => (
              <span key={sk} className="px-1.5 py-0.5 text-[10px] border border-neon-lime/40 text-neon-lime rounded-sm">{sk}</span>
            ))}
          </div>
        </div>
      )}
      {s.breakdown.required_skills.missing.length > 0 && (
        <div>
          <div className="panel-title mb-1">missing skills</div>
          <div className="flex flex-wrap gap-1">
            {s.breakdown.required_skills.missing.map((sk) => (
              <span key={sk} className="px-1.5 py-0.5 text-[10px] border border-neon-red/40 text-neon-red rounded-sm">{sk}</span>
            ))}
          </div>
        </div>
      )}

      {s.strengths.length > 0 && (
        <div>
          <div className="panel-title mb-1">strengths</div>
          <ul className="text-xs text-slate-300 space-y-0.5 list-disc list-inside">
            {s.strengths.map((st, i) => <li key={i}>{st}</li>)}
          </ul>
        </div>
      )}
      {s.gaps.length > 0 && (
        <div>
          <div className="panel-title mb-1">gaps</div>
          <ul className="text-xs text-slate-300 space-y-0.5 list-disc list-inside">
            {s.gaps.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </div>
      )}
      {s.resume_tweaks.length > 0 && (
        <div>
          <div className="panel-title mb-1">resume tweaks</div>
          <ul className="text-xs text-slate-300 space-y-0.5 list-disc list-inside">
            {s.resume_tweaks.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ScoreMatchForm({ jobId, onScore }: { jobId: number; onScore?: () => void }) {
  const [resumes, setResumes] = useState<ResumeView[] | null>(null);
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS);
  const [resumeId, setResumeId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [model, setModel] = useState("gpt-oss:120b");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
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
        setModel(pick.scoreModel || "gpt-oss:120b");
      }
    }).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  // Load models when account changes.
  useEffect(() => {
    if (accountId === null) return;
    api.accounts.models(accountId).then((list) => {
      const names = list.map((m) => m.name);
      setModels(names.length ? [...new Set([...names, ...FALLBACK_MODELS])] : FALLBACK_MODELS);
    }).catch(() => setModels(FALLBACK_MODELS));
  }, [accountId]);

  const score = async () => {
    if (resumeId === null || accountId === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.jobs.scoreMatch(jobId, { resumeId, accountId, model: model || undefined });
      onScore?.();
    } catch (e) {
      const err = e as ApiRequestError;
      const hint = err.kind === "quota" ? " — this account is out of quota, pick another" : "";
      setError(`${err.message}${hint}`);
    } finally {
      setBusy(false);
    }
  };

  if (error && resumes === null) return <div className="text-[10px] text-neon-red">{error}</div>;
  if (resumes === null) return <div className="text-[10px] text-slate-600 animate-pulseGlow">loading…</div>;

  const activeResumes = resumes.filter((r) => r.isActive);

  if (activeResumes.length === 0) {
    return <span className="text-[10px] text-slate-500">no active resumes. upload one in ACCOUNT → resumes.</span>;
  }
  if (accounts.length === 0) {
    return <span className="text-[10px] text-slate-500">no Ollama accounts. add one in ACCOUNT → ollama keys.</span>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
      <Field label="resume">
        <Select value={resumeId ?? ""} onChange={(e) => setResumeId(Number(e.target.value))}>
          {activeResumes.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="account">
        <Select value={accountId ?? ""} onChange={(e) => { setAccountId(Number(e.target.value)); const a = accounts.find((x) => x.id === Number(e.target.value)); if (a) setModel(a.scoreModel || "gpt-oss:120b"); }}>
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
      <div className="flex items-end">
        <NeonButton variant="cyan" onClick={score} disabled={busy || resumeId === null || accountId === null}>
          {busy ? "scoring…" : "score match"}
        </NeonButton>
      </div>
      {error && <div className="col-span-full text-[10px] text-neon-red">{error}</div>}
    </div>
  );
}

export function MatchPanel({ jobId, refreshKey, onMatchCount }: { jobId: number; refreshKey?: number; onMatchCount?: (count: number) => void }) {
  const [matches, setMatches] = useState<MatchScoreView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = () => {
    api.jobs.matches(jobId)
      .then(setMatches)
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => { load(); }, [jobId, refreshKey]);

  useEffect(() => {
    onMatchCount?.(matches.length);
    if (matches.length > 0 && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [matches, onMatchCount]);

  const removeMatch = async (matchId: number) => {
    try {
      await api.jobs.deleteMatch(jobId, matchId);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (error) return <Banner tone="error">{error}</Banner>;

  if (matches.length === 0) return null;

  return (
    <div ref={panelRef} className="space-y-2">
      <div className="panel-title">scores ({matches.length})</div>
      {matches.map((m) => (
        <MatchResult key={m.id} match={m} onDelete={() => removeMatch(m.id)} />
      ))}
    </div>
  );
}
