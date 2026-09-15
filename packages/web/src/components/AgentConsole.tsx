import { useEffect, useRef, useState } from "react";
import type { PipelineEvent } from "@joboutreach/shared";

const TAG_COLOR: Record<string, string> = {
  sys: "text-slate-500",
  crawl: "text-neon-cyan",
  llm: "text-neon-magenta",
  schema: "text-neon-lime",
  email: "text-neon-amber",
  error: "text-neon-red",
  queue: "text-neon-amber",
  job: "text-neon-cyan",
};

const LEVEL_COLOR: Record<string, string> = {
  info: "text-slate-300",
  warn: "text-neon-amber",
  error: "text-neon-red",
};

interface ConsoleLine {
  id: number;
  tag: string;
  text: string;
  tone: string;
}

function tagFor(event: PipelineEvent): string {
  if (event.type === "log") {
    const msg = event.message ?? "";
    if (/crawl|http|browser|ats/i.test(msg)) return "crawl";
    if (/extract|model|llm|schema/i.test(msg)) return "llm";
    if (/queue|quota|pause|resume/i.test(msg)) return "queue";
    if (event.level === "error") return "error";
    if (event.level === "warn") return "error";
    return "sys";
  }
  if (event.type === "job") return "job";
  if (event.type === "queue") return "queue";
  return "sys";
}

function textFor(event: PipelineEvent): string {
  if (event.type === "log") return event.message ?? "";
  if (event.type === "job") return `job ${event.jobId} → ${event.status}`;
  if (event.type === "queue") return `queue → ${event.queueState}`;
  return "";
}

export function AgentConsole() {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [connected, setConnected] = useState(false);
  const counterRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource("/api/events");

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (e) => {
      try {
        const raw = JSON.parse(e.data) as { type?: string };
        // The server sends a "hello" ack on connect; skip it.
        if (raw.type === "hello") return;
        const event = raw as PipelineEvent;
        const tag = tagFor(event);
        const tone = event.type === "log" ? (LEVEL_COLOR[event.level ?? "info"] ?? TAG_COLOR[tag] ?? "text-slate-300") : (TAG_COLOR[tag] ?? "text-slate-300");
        setLines((prev) => {
          const next = [...prev, {
            id: counterRef.current++,
            tag,
            text: textFor(event),
            tone,
          }];
          // Keep last 200 lines.
          return next.length > 200 ? next.slice(-200) : next;
        });
      } catch {
        // ignore malformed events
      }
    };

    return () => es.close();
  }, []);

  // Auto-scroll to bottom on new lines.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-grid">
        <span className="panel-title">agent console</span>
        <span className="flex items-center gap-2 text-[10px] text-slate-600">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? "bg-neon-lime shadow-neon-lime" : "bg-neon-red"}`} />
          {connected ? "live" : "disconnected"} · {lines.length} events
        </span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-2 text-xs leading-5">
        {lines.length === 0 && (
          <div className="flex gap-3">
            <span className="text-slate-700 tabular-nums">001</span>
            <span className="text-slate-600">awaiting pipeline events…</span>
          </div>
        )}
        {lines.map((l) => (
          <div key={l.id} className="flex gap-3">
            <span className="text-slate-700 tabular-nums">{String(l.id + 1).padStart(3, "0")}</span>
            <span className={`w-14 shrink-0 ${TAG_COLOR[l.tag] ?? "text-slate-400"}`}>[{l.tag}]</span>
            <span className={l.tone}>{l.text}</span>
          </div>
        ))}
        <div className="flex gap-3">
          <span className="text-slate-700 tabular-nums">{String(lines.length + 1).padStart(3, "0")}</span>
          <span className="text-neon-cyan animate-blink">▍</span>
        </div>
      </div>
    </div>
  );
}
