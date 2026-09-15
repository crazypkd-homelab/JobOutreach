import { useState } from "react";
import { OllamaKeysTab } from "./OllamaKeysTab";
import { PromptsTab } from "./PromptsTab";

const TABS = [
  { id: "ollama", label: "ollama keys", ready: true },
  { id: "prompts", label: "prompts", ready: true },
  { id: "resumes", label: "resumes", ready: false, hint: "upload PDF/DOCX resumes and review the extracted text — milestone 3" },
  { id: "smtp", label: "email (smtp)", ready: false, hint: "your SMTP host, credentials and sender identity — milestone 4" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AccountPage() {
  const [tab, setTab] = useState<TabId>("ollama");
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="space-y-5">
      <header>
        <div className="panel-title">module 02</div>
        <h1 className="text-xl neon-text-cyan tracking-widest">ACCOUNT</h1>
        <p className="mt-2 text-xs text-slate-500">everything that belongs to you: credentials, resumes, and prompts.</p>
      </header>

      <nav className="flex gap-1 border-b border-grid">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              "px-3 py-2 text-[11px] uppercase tracking-[0.15em] border-b-2 -mb-px transition-colors",
              t.id === tab ? "border-neon-cyan text-neon-cyan" : "border-transparent text-slate-500 hover:text-slate-300",
            ].join(" ")}
          >
            {t.label}
            {!t.ready && <span className="ml-1.5 text-[9px] text-slate-700">soon</span>}
          </button>
        ))}
      </nav>

      {tab === "ollama" && <OllamaKeysTab />}
      {tab === "prompts" && <PromptsTab />}
      {!active.ready && <div className="panel p-4 text-xs text-slate-500">{"hint" in active ? active.hint : null}</div>}
    </div>
  );
}
