import { NavLink, Outlet } from "react-router-dom";
import { AgentConsole } from "../components/AgentConsole";

const MODULES = [
  { to: "/", label: "DASHBOARD", code: "00" },
  { to: "/jobs", label: "JOBS", code: "01" },
  { to: "/account", label: "ACCOUNT", code: "02" },
];

export function Shell() {
  return (
    <div className="scanlines h-screen grid grid-cols-[220px_1fr] grid-rows-[1fr_200px]">
      <aside className="row-span-2 border-r border-grid bg-panel/60 flex flex-col">
        <div className="px-4 py-5 border-b border-grid">
          <div className="text-[10px] tracking-[0.3em] text-slate-500">SYS://</div>
          <div className="text-lg font-bold neon-text-cyan tracking-wider">JOBOUTREACH</div>
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
              <span className="text-[10px] text-slate-600 group-hover:text-slate-500">{m.code}</span>
              <span>{m.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-grid text-[10px] text-slate-600 flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-neon-lime shadow-neon-lime animate-pulseGlow" />
          <span>QUEUE: IDLE</span>
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
