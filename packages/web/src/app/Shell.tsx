import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { AgentConsole } from "../components/AgentConsole";
import { api } from "../api/client";
import { useAuth } from "./AuthProvider";
import { NeonButton } from "../components/ui";
import type { QueueStatus } from "@joboutreach/shared";

const MODULES = [
  { to: "/jobs", label: "JOBS" },
  { to: "/account", label: "ACCOUNT" },
];

const QUEUE_INDICATOR: Record<string, { color: string; label: string }> = {
  idle: { color: "bg-neon-lime shadow-neon-lime", label: "QUEUE: IDLE" },
  running: { color: "bg-neon-cyan shadow-neon-cyan animate-pulseGlow", label: "QUEUE: RUNNING" },
  paused: { color: "bg-neon-amber", label: "QUEUE: PAUSED" },
};

const FALLBACK_INDICATOR = { color: "bg-neon-lime shadow-neon-lime", label: "QUEUE: IDLE" };

export function Shell() {
  const { user, logout } = useAuth();
  const [queue, setQueue] = useState<QueueStatus | null>(null);

  useEffect(() => {
    const load = () => api.queue.status().then(setQueue).catch(() => {});
    void load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, []);

  const q = (queue && QUEUE_INDICATOR[queue.state]) ?? FALLBACK_INDICATOR;

  return (
    <div className="scanlines h-screen grid grid-cols-[220px_1fr] grid-rows-[1fr_140px]">
      <aside className="row-span-2 border-r border-grid bg-panel/60 flex flex-col">
        <div className="px-4 py-5 border-b border-grid">
          <div className="flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 64 64" className="shrink-0">
              <rect width="64" height="64" rx="12" fill="#0a0e14" />
              <path d="M14 22 L32 36 L50 22" stroke="#22d3ee" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="14" y="20" width="36" height="24" rx="3" stroke="#22d3ee" strokeWidth="3" fill="none" />
              <path d="M38 42 L52 42" stroke="#a3e635" strokeWidth="3" fill="none" strokeLinecap="round" />
              <path d="M47 37 L52 42 L47 47" stroke="#a3e635" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="text-lg font-bold neon-text-cyan tracking-wider">JOB OUTREACH</div>
          </div>
          <div className="text-[10px] text-slate-600 mt-1">agentic outreach console v0.1</div>
        </div>
        <nav className="flex-1 py-3">
          {MODULES.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              end={m.to === "/"}
              className={({ isActive }) =>
                [
                  "group flex items-center gap-3 px-4 py-2 text-xs tracking-[0.2em] border-l-2 transition-colors",
                  isActive
                    ? "border-neon-cyan text-neon-cyan bg-neon-cyan/5"
                    : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/[0.02]",
                ].join(" ")
              }
            >
              <span>{m.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-grid text-[10px] text-slate-600 flex items-center gap-2">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${q.color}`} />
          <span>{q.label}</span>
          {queue && queue.queuedCount > 0 && <span className="text-slate-700">· {queue.queuedCount} queued</span>}
        </div>

        <div className="px-4 py-3 border-t border-grid">
          <div className="text-[10px] text-slate-500 mb-2 truncate" title={user?.username}>
            {user?.username ?? "unknown"}
          </div>
          <NeonButton variant="ghost" className="w-full" onClick={() => logout()}>
            Log out
          </NeonButton>
        </div>
      </aside>

      <main className="overflow-auto p-6">
        <Outlet />
      </main>

      <footer className="col-start-2 border-t border-grid bg-panel/70">
        <AgentConsole />
      </footer>
    </div>
  );
}
