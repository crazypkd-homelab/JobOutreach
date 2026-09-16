import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { JobView } from "@joboutreach/shared";
import { api, ApiRequestError } from "../../api/client";
import { Banner, Modal, NeonButton } from "../../components/ui";
import { NewJobForm } from "./NewJobForm";
import { StatusChip } from "./StatusChip";

export function JobsPage() {
  const [jobs, setJobs] = useState<JobView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevJobsRef = useRef<JobView[] | null>(null);
  const navigate = useNavigate();

  const [deleting, setDeleting] = useState<JobView | null>(null);

  const load = () => api.jobs.list().then(setJobs).catch((e: Error) => setError(e.message));

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await api.jobs.remove(deleting.id);
      setDeleting(null);
      void load();
    } catch (e) {
      setError((e as ApiRequestError).message);
      setDeleting(null);
    }
  };

  // If a job just finished extracting while the user is on /jobs, open it.
  useEffect(() => {
    const previous = prevJobsRef.current;
    if (previous && jobs) {
      const newlyExtracted = jobs.find((j) =>
        j.status === "extracted" &&
        !previous.some((p) => p.id === j.id && p.status === "extracted")
      );
      if (newlyExtracted) {
        navigate(`/jobs/${newlyExtracted.id}`);
      }
    }
    prevJobsRef.current = jobs;
  }, [jobs, navigate]);

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
        <h1 className="text-xl neon-text-cyan tracking-widest">JOBS</h1>
        <p className="mt-2 text-xs text-slate-500">crawl a posting, extract the JD, score resumes, send outreach.</p>
      </header>

      <NewJobForm onCreated={load} disabled={hasActiveJob} />

      <section className="space-y-2">
        <div className="panel-title">postings ({jobs.length})</div>
        {jobs.length === 0 ? (
          <div className="panel p-4 text-xs text-slate-500">no jobs yet. paste a URL above to get started.</div>
        ) : (
          jobs.map((job) => {
            const isActive = ["queued", "crawling", "extracting"].includes(job.status);
            return (
              <div
                key={job.id}
                className="panel p-3 flex items-center gap-4 hover:border-neon-cyan/40 transition-colors group"
              >
                <Link to={`/jobs/${job.id}`} className="min-w-0 flex-1 flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {isActive ? (
                        <span className="inline-flex gap-1 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-blink" style={{ animationDelay: "0ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-blink" style={{ animationDelay: "150ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-blink" style={{ animationDelay: "300ms" }} />
                        </span>
                      ) : (
                        <StatusChip status={job.status} />
                      )}
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
                {!isActive && (
                  <NeonButton
                    variant="danger"
                    onClick={() => setDeleting(job)}
                  >
                    delete
                  </NeonButton>
                )}
              </div>
            );
          })
        )}
      </section>

      <Modal
        open={!!deleting}
        title="delete job"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
        confirmLabel="delete"
        variant="danger"
      >
        Delete "{deleting?.title ?? "untitled"}"? This removes all matches, contacts, and outreach for this job. This cannot be undone.
      </Modal>
    </div>
  );
}
