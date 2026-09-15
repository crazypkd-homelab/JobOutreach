import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { JobView } from "@joboutreach/shared";
import { api } from "../../api/client";
import { Banner } from "../../components/ui";
import { NewJobForm } from "./NewJobForm";
import { StatusChip } from "./StatusChip";

export function JobsPage() {
  const [jobs, setJobs] = useState<JobView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.jobs.list().then(setJobs).catch((e: Error) => setError(e.message));

  useEffect(() => {
    void load();
    // Poll for updates while there are active jobs.
    const timer = setInterval(() => {
      if (jobs?.some((j) => ["queued", "crawling", "extracting"].includes(j.status))) {
        void load();
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [jobs]);

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!jobs) return <div className="text-xs text-slate-600 animate-pulseGlow">loading jobs…</div>;

  const hasActiveJob = jobs.some((j) => ["queued", "crawling", "extracting"].includes(j.status));

  return (
    <div className="space-y-5">
      <header>
        <div className="panel-title">module 01</div>
        <h1 className="text-xl neon-text-cyan tracking-widest">JOBS</h1>
        <p className="mt-2 text-xs text-slate-500">crawl a posting, extract the JD, score resumes, send outreach.</p>
      </header>

      <NewJobForm onCreated={load} disabled={hasActiveJob} />

      <section className="space-y-2">
        <div className="panel-title">postings ({jobs.length})</div>
        {jobs.length === 0 ? (
          <div className="panel p-4 text-xs text-slate-500">no jobs yet. paste a URL above to get started.</div>
        ) : (
          jobs.map((job) => (
            <Link
              key={job.id}
              to={`/jobs/${job.id}`}
              className="panel p-3 flex items-center gap-4 hover:border-neon-cyan/40 transition-colors group"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <StatusChip status={job.status} />
                  <span className="text-sm text-slate-200 truncate group-hover:text-neon-cyan">
                    {job.title ?? "untitled"}
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-slate-600 truncate">
                  {job.company ?? "unknown company"}
                  {job.location ? ` · ${job.location}` : ""}
                  {job.sourceUrl ? ` · ${job.sourceUrl}` : " · manual paste"}
                </div>
              </div>
              <div className="text-[10px] text-slate-700 shrink-0">
                {new Date(job.createdAt).toLocaleString()}
              </div>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
