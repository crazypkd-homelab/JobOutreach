export function Placeholder({ module, note }: { module: string; note?: string }) {
  return (
    <div className="panel p-6 max-w-xl">
      <div className="panel-title mb-2">module</div>
      <div className="text-2xl neon-text-magenta tracking-widest">{module}</div>
      <p className="mt-3 text-xs text-slate-500">{note ?? "not yet online. scheduled for a later milestone."}</p>
    </div>
  );
}
