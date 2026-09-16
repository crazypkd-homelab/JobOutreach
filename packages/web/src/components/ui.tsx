import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

type Variant = "cyan" | "magenta" | "lime" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  cyan: "border-neon-cyan/60 text-neon-cyan hover:bg-neon-cyan/10 hover:shadow-neon-cyan",
  magenta: "border-neon-magenta/60 text-neon-magenta hover:bg-neon-magenta/10 hover:shadow-neon-magenta",
  lime: "border-neon-lime/60 text-neon-lime hover:bg-neon-lime/10 hover:shadow-neon-lime",
  ghost: "border-grid text-slate-400 hover:text-slate-200 hover:border-slate-600",
  danger: "border-neon-red/50 text-neon-red hover:bg-neon-red/10",
};

export function NeonButton({
  variant = "cyan",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`px-3 py-1.5 text-[11px] tracking-[0.15em] uppercase border rounded-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:shadow-none ${VARIANT[variant]} ${className}`}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="panel-title">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10px] text-slate-600">{hint}</span>}
    </label>
  );
}

const CONTROL =
  "mt-1 w-full bg-void border border-grid rounded-sm px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-neon-cyan/70 focus:shadow-neon-cyan/50 placeholder:text-slate-700";

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} ${className}`} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL} ${className}`} />;
}

export function Chip({ tone = "slate", children }: { tone?: "slate" | "lime" | "amber" | "red"; children: ReactNode }) {
  const tones = {
    slate: "border-grid text-slate-500",
    lime: "border-neon-lime/50 text-neon-lime",
    amber: "border-neon-amber/50 text-neon-amber",
    red: "border-neon-red/50 text-neon-red",
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-wider border rounded-sm ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Banner({ tone, children }: { tone: "error" | "ok"; children: ReactNode }) {
  const cls = tone === "error" ? "border-neon-red/50 text-neon-red" : "border-neon-lime/50 text-neon-lime";
  return <div className={`panel border ${cls} px-3 py-2 text-xs`}>{children}</div>;
}

export function Modal({
  open,
  title,
  children,
  onConfirm,
  onCancel,
  confirmLabel = "confirm",
  cancelLabel = "cancel",
  variant = "danger",
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm" onClick={onCancel}>
      <div className="panel p-5 max-w-md w-full mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">{title}</div>
        <div className="text-xs text-slate-400">{children}</div>
        <div className="flex gap-2 justify-end">
          <NeonButton variant="ghost" onClick={onCancel}>{cancelLabel}</NeonButton>
          <NeonButton variant={variant} onClick={onConfirm}>{confirmLabel}</NeonButton>
        </div>
      </div>
    </div>
  );
}
