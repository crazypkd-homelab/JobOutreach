import { useEffect, useState } from "react";
import type { PromptView } from "@joboutreach/shared";
import { api } from "../../api/client";
import { Banner, Chip, NeonButton } from "../../components/ui";

const TITLES: Record<string, string> = {
  extract_jd: "job description extraction",
  score_resume: "resume scoring",
};

function PromptCard({ prompt, onReset }: { prompt: PromptView; onReset: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="panel p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm tracking-widest text-slate-200">{TITLES[prompt.name] ?? prompt.name}</span>
            {prompt.isDefault ? <Chip>default</Chip> : <Chip tone="amber">edited</Chip>}
          </div>
          <div className="mt-1 text-[10px] text-slate-600 break-all">{prompt.path}</div>
        </div>
        <div className="flex gap-2">
          <NeonButton variant="ghost" onClick={() => setOpen(!open)}>
            {open ? "hide" : "view"}
          </NeonButton>
          <NeonButton
            variant="magenta"
            disabled={busy || prompt.isDefault}
            onClick={async () => {
              setBusy(true);
              try {
                await api.prompts.reset(prompt.name);
                onReset();
              } finally {
                setBusy(false);
              }
            }}
          >
            reset
          </NeonButton>
        </div>
      </div>
      {open && (
        <pre className="bg-void border border-grid rounded-sm p-3 text-[11px] text-slate-400 whitespace-pre-wrap max-h-72 overflow-auto">
          {prompt.text}
        </pre>
      )}
    </div>
  );
}

export function PromptsTab() {
  const [prompts, setPrompts] = useState<PromptView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api.prompts
      .list()
      .then(setPrompts)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void load();
  }, []);

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!prompts) return <div className="text-xs text-slate-600 animate-pulseGlow">loading prompts…</div>;

  return (
    <div className="space-y-3">
      <div className="panel p-3 text-[11px] text-slate-500 leading-relaxed">
        Edit these files directly on the <code className="text-neon-cyan">data/prompts</code> volume — changes are picked up on the next run,
        no restart needed. The output shape is enforced by a JSON schema, so prompt edits cannot break the app.
      </div>
      {prompts.map((p) => (
        <PromptCard key={p.name} prompt={p} onReset={load} />
      ))}
    </div>
  );
}
