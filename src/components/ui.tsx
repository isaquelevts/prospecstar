"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import useSWR, { type SWRConfiguration } from "swr";
import { WEBSITE_STATUS_LABEL } from "@/lib/website";

// ---------- dados ----------

export async function api<T = any>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Sessão expirada");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
  return data as T;
}

export function useApi<T = any>(url: string | null, opts?: SWRConfiguration) {
  return useSWR<T>(url, (u: string) => api<T>(u), { revalidateOnFocus: true, ...opts });
}

// ---------- toast ----------

type Toast = { id: number; text: string; kind: "ok" | "error" };
const ToastCtx = createContext<(text: string, kind?: Toast["kind"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text, kind }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={`max-w-sm rounded-lg px-4 py-3 text-sm shadow-lg ${t.kind === "error" ? "bg-bad text-white" : "bg-ink text-white"}`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Executa uma ação assíncrona mostrando toast de sucesso/erro. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string | ((r: T) => string)) => {
      setBusy(true);
      try {
        const r = await fn();
        if (success) toast(typeof success === "function" ? success(r) : success);
        return r;
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), "error");
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { run, busy };
}

// ---------- primitivos ----------

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "outline"; size?: "sm" | "md" };

export function Button({ variant = "primary", size = "md", className = "", ...p }: BtnProps) {
  const v = {
    primary: "bg-cobalt text-white hover:bg-[#1a32c4]",
    outline: "border border-line bg-card hover:border-ink/30",
    ghost: "hover:bg-ink/5",
    danger: "bg-bad text-white hover:bg-[#a82622]",
  }[variant];
  const s = size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm";
  return (
    <button
      {...p}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none ${v} ${s} ${className}`}
    />
  );
}

const field = "w-full rounded-lg border border-line bg-card px-3 text-sm placeholder:text-mute/70 focus:border-cobalt focus:outline-none";

export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`${field} h-10 ${p.className ?? ""}`} />;
}

export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={`${field} py-2 leading-relaxed ${p.className ?? ""}`} />;
}

export function Select(p: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={`${field} h-10 pr-8 ${p.className ?? ""}`} />;
}

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-mute">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-sm"
    >
      <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-cobalt" : "bg-line"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-xl border border-line bg-card ${className}`}>{children}</div>;
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-mute">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({ children, color, className = "" }: { children: React.ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${color ? "" : "bg-ink/5 text-ink/70"} ${className}`}
      style={color ? { background: color + "1f", color } : undefined}
    >
      {children}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full rounded-xl bg-card shadow-2xl ${wide ? "max-w-3xl" : "max-w-lg"}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-mute hover:bg-ink/5" aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-14 text-center">
      <p className="font-display text-lg font-bold">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-mute">{children}</div>}
    </div>
  );
}

// ---------- elementos do domínio ----------

const STATUS_COLOR: Record<string, string> = {
  NONE: "#f0531c",
  SOCIAL_ONLY: "#e0711c",
  OFFLINE: "#c9302c",
  NOT_MOBILE: "#b7791f",
  OUTDATED: "#b7791f",
  NO_HTTPS: "#b7791f",
  OK: "#138a52",
};

export function SiteBadge({ status }: { status?: string | null }) {
  if (!status) return <Badge>Analisando…</Badge>;
  return <Badge color={STATUS_COLOR[status]}>{WEBSITE_STATUS_LABEL[status] ?? status}</Badge>;
}

/** Termômetro do lead: quanto mais quente, mais a empresa precisa de um site. */
export function Heat({ score, showNumber = true }: { score: number; showNumber?: boolean }) {
  const hue = score >= 70 ? "var(--color-heat)" : score >= 45 ? "var(--color-warn)" : "#9aa1ad";
  return (
    <span className="inline-flex items-center gap-2" title={`Temperatura ${score}/100`}>
      <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-line">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${score}%`, background: hue }} />
      </span>
      {showNumber && (
        <span className="font-mono text-xs tabular-nums" style={{ color: hue }}>
          {score}
        </span>
      )}
    </span>
  );
}

export function timeAgo(date?: string | Date | null) {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d`;
  return d.toLocaleDateString("pt-BR");
}

export function formatPhone(phone?: string | null) {
  if (!phone) return "";
  const m = phone.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${phone}`;
}
