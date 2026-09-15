import { useEffect, useRef, useState } from "react";
import type { ResumeView } from "@joboutreach/shared";
import { api, ApiRequestError } from "../../api/client";
import { Banner, Chip, NeonButton } from "../../components/ui";

function ResumeCard({ resume, onChanged }: { resume: ResumeView; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(resume.parsedText);
  const [name, setName] = useState(resume.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const patch: { name?: string; parsedText?: string } = {};
      if (name.trim() && name.trim() !== resume.name) patch.name = name.trim();
      if (text !== resume.parsedText) patch.parsedText = text;
      if (Object.keys(patch).length > 0) await api.resumes.update(resume.id, patch);
      setEditing(false);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.resumes.remove(resume.id);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm tracking-widest text-slate-200 truncate">{resume.name}</span>
            {resume.isActive ? <Chip tone="lime">active</Chip> : <Chip>inactive</Chip>}
          </div>
          <div className="mt-1 text-[10px] text-slate-600">
            {resume.mime ?? "unknown type"} · {resume.parsedText.length.toLocaleString()} chars
            {" · "}added {new Date(resume.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <NeonButton variant="ghost" disabled={busy} onClick={() => { setEditing(!editing); setName(resume.name); setText(resume.parsedText); }}>
            {editing ? "hide" : "edit"}
          </NeonButton>
          <NeonButton
            variant="ghost"
            disabled={busy}
            onClick={() => api.resumes.update(resume.id, { isActive: !resume.isActive }).then(onChanged).catch((e: Error) => setError(e.message))}
          >
            {resume.isActive ? "deactivate" : "activate"}
          </NeonButton>
          <NeonButton variant="danger" disabled={busy} onClick={remove}>
            delete
          </NeonButton>
        </div>
      </div>

      {editing && (
        <div className="space-y-3 pt-2 border-t border-grid">
          <label className="block">
            <span className="panel-title">name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full bg-void border border-grid rounded-sm px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-neon-cyan/70"
            />
          </label>
          <label className="block">
            <span className="panel-title">parsed text (editable)</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              className="mt-1 w-full bg-void border border-grid rounded-sm px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-neon-cyan/70 font-mono"
            />
          </label>
          <div className="flex gap-2">
            <NeonButton variant="cyan" disabled={busy} onClick={save}>
              {busy ? "saving…" : "save"}
            </NeonButton>
            <NeonButton variant="ghost" disabled={busy} onClick={() => { setEditing(false); setError(null); }}>
              cancel
            </NeonButton>
          </div>
        </div>
      )}

      {error && <Banner tone="error">{error}</Banner>}
    </div>
  );
}

function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      await api.resumes.upload(file);
      onUploaded();
    } catch (e) {
      setError((e as ApiRequestError).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="panel p-4 space-y-3">
      <div className="panel-title">upload resume</div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void upload(file);
        }}
        className={`border border-dashed rounded-sm p-6 text-center cursor-pointer transition-colors ${dragOver ? "border-neon-cyan/60 bg-neon-cyan/5" : "border-grid hover:border-slate-600"}`}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
        />
        {busy ? (
          <div className="flex items-center justify-center gap-2 text-xs text-neon-cyan">
            <span className="inline-flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-blink" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-blink" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-blink" style={{ animationDelay: "300ms" }} />
            </span>
            parsing…
          </div>
        ) : (
          <div className="text-xs text-slate-500">
            drag & drop or <span className="text-neon-cyan">click to browse</span>
            <div className="mt-1 text-[10px] text-slate-700">PDF or DOCX · max 10 MB</div>
          </div>
        )}
      </div>
      {error && <Banner tone="error">{error}</Banner>}
    </div>
  );
}

export function ResumesTab() {
  const [resumes, setResumes] = useState<ResumeView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.resumes.list().then(setResumes).catch((e: Error) => setError(e.message));

  useEffect(() => { void load(); }, []);

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!resumes) return <div className="text-xs text-slate-600 animate-pulseGlow">loading resumes…</div>;

  return (
    <div className="space-y-3">
      <div className="panel p-3 text-[11px] text-slate-500 leading-relaxed">
        Upload PDF or DOCX resumes. The text is extracted automatically and can be edited — the edited version is what
        gets scored against job descriptions.
      </div>
      <UploadForm onUploaded={load} />
      {resumes.length === 0 ? (
        <div className="panel p-4 text-xs text-slate-500">no resumes yet. upload one above.</div>
      ) : (
        resumes.map((r) => <ResumeCard key={r.id} resume={r} onChanged={load} />)
      )}
    </div>
  );
}
