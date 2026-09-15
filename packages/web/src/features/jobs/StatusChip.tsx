import type { JobStatus } from "@joboutreach/shared";

const STATUS_META: Record<JobStatus, { label: string; tone: "slate" | "cyan" | "amber" | "lime" | "red" | "magenta" }> = {
  queued: { label: "queued", tone: "slate" },
  crawling: { label: "crawling", tone: "cyan" },
  needs_manual_input: { label: "needs paste", tone: "amber" },
  extracting: { label: "extracting", tone: "magenta" },
  extracted: { label: "extracted", tone: "lime" },
  failed: { label: "failed", tone: "red" },
};

const TONE_CLASS: Record<string, string> = {
  slate: "border-grid text-slate-500",
  cyan: "border-neon-cyan/50 text-neon-cyan",
  amber: "border-neon-amber/50 text-neon-amber",
  lime: "border-neon-lime/50 text-neon-lime",
  red: "border-neon-red/50 text-neon-red",
  magenta: "border-neon-magenta/50 text-neon-magenta",
};

export function StatusChip({ status }: { status: JobStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-wider border rounded-sm ${TONE_CLASS[meta.tone]}`}>
      {meta.label}
    </span>
  );
}

export { STATUS_META };
