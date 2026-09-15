import { useEffect, useState } from "react";
import { api, type DashboardResponse } from "../../api/client";

type Tone = "cyan" | "magenta" | "lime" | "amber";

const TONE = {
  cyan: "neon-text-cyan",
  magenta: "neon-text-magenta",
  lime: "neon-text-lime",
  amber: "text-neon-amber",
} satisfies Record<Tone, string>;

function StatTile({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone: Tone }) {
  return (
    <div className="panel p-4">
      <div className="panel-title">{label}</div>
      <div className={`mt-2 text-3xl tabular-nums ${TONE[tone]}`}>{value}</div>
      {sub && <div className="mt-1 text-[10px] text-slate-600">{sub}</div>}
    </div>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.dashboard().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="panel p-4 text-neon-red text-xs">api error: {error}</div>;
  if (!data) return <div className="text-xs text-slate-600 animate-pulseGlow">loading telemetry…</div>;

  const { crawl, extract, score, email } = data.counts;
  const crawlTotal = crawl.success + crawl.failed + crawl.manual_fallback;
  const crawlRate = crawlTotal ? Math.round((crawl.success / crawlTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      <header>
        <div className="panel-title">module 00</div>
        <h1 className="text-xl neon-text-cyan tracking-widest">DASHBOARD</h1>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="crawls ok" value={crawl.success} sub={`${crawlRate}% success`} tone="cyan" />
        <StatTile label="crawls failed" value={crawl.failed} sub={`${crawl.manual_fallback} manual fallback`} tone="magenta" />
        <StatTile label="extractions ok" value={extract.success} sub={`${extract.failed} failed`} tone="lime" />
        <StatTile label="scores run" value={score.success} sub={`${score.failed} failed`} tone="cyan" />
        <StatTile label="emails sent" value={email.success} tone="lime" />
        <StatTile label="emails failed" value={email.failed} tone="magenta" />
      </section>

      <section className="panel p-4">
        <div className="panel-title mb-2">recent activity</div>
        <div className="text-xs text-slate-600">no events yet. add an Ollama account and crawl your first posting.</div>
      </section>
    </div>
  );
}
