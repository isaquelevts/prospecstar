"use client";

/**
 * Atalhos usados pelas telas. Por baixo, todos usam os componentes do shadcn/ui desta pasta
 * (button.tsx, input.tsx, dialog.tsx…), então o visual fica consistente em todo o sistema.
 */

import { useCallback, useId, useState } from "react";
import useSWR, { type SWRConfiguration } from "swr";
import { toast } from "sonner";
import { WEBSITE_STATUS_LABEL } from "@/lib/website";
import { cn } from "@/lib/utils";
import { Button as ShadButton } from "./button";
import { Input as ShadInput } from "./input";
import { Textarea as ShadTextarea } from "./textarea";
import { NativeSelect } from "./native-select";
import { Switch } from "./switch";
import { Label } from "./label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import { Toaster } from "./sonner";
import { TooltipProvider } from "./tooltip";

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

// ---------- toast (Sonner) ----------

type ToastKind = "ok" | "error";
const push = (text: string, kind: ToastKind = "ok") => (kind === "error" ? toast.error(text) : toast.success(text));
export const useToast = () => push;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      {children}
      <Toaster />
    </TooltipProvider>
  );
}

/** Executa uma ação assíncrona mostrando toast de sucesso/erro. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, success?: string | ((r: T) => string)) => {
    setBusy(true);
    try {
      const r = await fn();
      if (success) push(typeof success === "function" ? success(r) : success);
      return r;
    } catch (e) {
      push(e instanceof Error ? e.message : String(e), "error");
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { run, busy };
}

// ---------- primitivos ----------

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "outline" | "secondary"; size?: "sm" | "md" };

export function Button({ variant = "primary", size = "md", ...p }: BtnProps) {
  const v = ({ primary: "default", danger: "destructive" } as const)[variant as "primary" | "danger"] ?? (variant as "ghost" | "outline" | "secondary");
  return <ShadButton variant={v} size={size === "sm" ? "sm" : "default"} {...p} />;
}

export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <ShadInput {...p} />;
}

export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <ShadTextarea {...p} className={cn("field-sizing-fixed leading-relaxed", p.className)} />;
}

export function Select(p: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <NativeSelect {...p} />;
}

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm leading-none font-medium">{label}</span>
      {children}
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <span className="inline-flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
      {label && (
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
      )}
    </span>
  );
}

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("bg-card text-card-foreground rounded-xl border shadow-sm", className)}>{children}</div>;
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="text-muted-foreground mt-1 text-sm">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Badge do shadcn; com `color` vira um badge suave na cor informada (etapas do funil, status). */
export function Badge({ children, color, className = "" }: { children: React.ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        color ? "border-transparent" : "bg-secondary text-secondary-foreground border-transparent",
        className,
      )}
      style={color ? { background: color + "1f", color } : undefined}
    >
      {children}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={wide ? "sm:max-w-3xl" : "sm:max-w-lg"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div>{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-14 text-center">
      {icon && <div className="bg-muted text-muted-foreground mb-4 flex size-12 items-center justify-center rounded-full [&_svg]:size-6">{icon}</div>}
      <p className="text-lg font-semibold">{title}</p>
      {children && <div className="text-muted-foreground mx-auto mt-2 max-w-md text-sm">{children}</div>}
    </div>
  );
}

// ---------- elementos do domínio ----------

const STATUS_COLOR: Record<string, string> = {
  NONE: "#ea580c",
  SOCIAL_ONLY: "#d97706",
  OFFLINE: "#dc2626",
  NOT_MOBILE: "#ca8a04",
  OUTDATED: "#ca8a04",
  NO_HTTPS: "#ca8a04",
  OK: "#059669",
};

export function SiteBadge({ status }: { status?: string | null }) {
  if (!status) return <Badge>Analisando…</Badge>;
  return <Badge color={STATUS_COLOR[status]}>{WEBSITE_STATUS_LABEL[status] ?? status}</Badge>;
}

/** Termômetro do lead: quanto mais quente, mais a empresa precisa de um site. */
export function Heat({ score, showNumber = true }: { score: number; showNumber?: boolean }) {
  const hue = score >= 70 ? "var(--color-heat)" : score >= 45 ? "var(--color-warn)" : "var(--muted-foreground)";
  return (
    <span className="inline-flex items-center gap-2" title={`Temperatura ${score}/100`}>
      <span className="bg-muted relative h-1.5 w-14 overflow-hidden rounded-full">
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

export function initials(name?: string | null) {
  const parts = (name ?? "").replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
