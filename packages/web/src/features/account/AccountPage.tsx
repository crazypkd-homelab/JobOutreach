const SECTIONS = [
  {
    id: "ollama",
    label: "ollama keys",
    hint: "add one or more Ollama Cloud API keys. pick which account each crawl or score run uses, with per-task model defaults (extract: gpt-oss:20b, score: gpt-oss:120b).",
    milestone: "m1",
  },
  {
    id: "resumes",
    label: "resumes",
    hint: "upload PDF/DOCX resumes, review the extracted text, and mark which ones are active for scoring.",
    milestone: "m3",
  },
  {
    id: "smtp",
    label: "email (smtp)",
    hint: "your own SMTP host and credentials, sender identity, and a test-send button.",
    milestone: "m4",
  },
  {
    id: "prompts",
    label: "prompts",
    hint: "view the extraction and scoring prompts loaded from data/prompts, with reset-to-default.",
    milestone: "m1",
  },
];

export function AccountPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="panel-title">module 02</div>
        <h1 className="text-xl neon-text-cyan tracking-widest">ACCOUNT</h1>
        <p className="mt-2 text-xs text-slate-500">
          everything that belongs to you: credentials, resumes, and prompt configuration.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-2">
        {SECTIONS.map((s) => (
          <div key={s.id} className="panel p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm tracking-widest text-slate-300">{s.label}</span>
              <span className="text-[10px] px-1.5 py-0.5 border border-grid text-slate-600 rounded-sm">
                {s.milestone}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">{s.hint}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
