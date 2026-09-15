const BOOT_LINES = [
  { tag: "sys", text: "console online. awaiting pipeline events." },
  { tag: "sys", text: "SSE stream will attach here in milestone 2." },
];

const TAG_COLOR: Record<string, string> = {
  sys: "text-slate-500",
  crawl: "text-neon-cyan",
  llm: "text-neon-magenta",
  schema: "text-neon-lime",
  email: "text-neon-amber",
  error: "text-neon-red",
};

export function AgentConsole() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-grid">
        <span className="panel-title">agent console</span>
        <span className="text-[10px] text-slate-600">0 events</span>
      </div>
      <div className="flex-1 overflow-auto px-4 py-2 text-xs leading-5">
        {BOOT_LINES.map((l, i) => (
          <div key={i} className="flex gap-3">
            <span className="text-slate-700 tabular-nums">{String(i + 1).padStart(3, "0")}</span>
            <span className={`w-14 shrink-0 ${TAG_COLOR[l.tag] ?? "text-slate-400"}`}>[{l.tag}]</span>
            <span className="text-slate-300">{l.text}</span>
          </div>
        ))}
        <div className="flex gap-3">
          <span className="text-slate-700 tabular-nums">{String(BOOT_LINES.length + 1).padStart(3, "0")}</span>
          <span className="text-neon-cyan animate-blink">▍</span>
        </div>
      </div>
    </div>
  );
}
