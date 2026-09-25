"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ToastProvider, useApi } from "@/components/ui";

const NAV = [
  { href: "/", label: "Painel" },
  { href: "/inbox", label: "Conversas", badge: true },
  { href: "/leads", label: "Leads" },
  { href: "/pipeline", label: "Funil" },
  { href: "/scraper", label: "Captação" },
  { href: "/campaigns", label: "Disparos" },
  { href: "/agents", label: "Agentes IA" },
  { href: "/flows", label: "Automações" },
  { href: "/settings", label: "Configurações" },
];

function WhatsAppStatus() {
  const { data } = useApi<{ status: string; me?: { pushName?: string } | null }>("/api/whatsapp", { refreshInterval: 30_000 });
  const ok = data?.status === "WORKING";
  return (
    <Link href="/settings#whatsapp" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/60 hover:bg-white/5">
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-[#3ddc84]" : "bg-heat"}`} />
      {ok ? `WhatsApp conectado${data?.me?.pushName ? ` · ${data.me.pushName}` : ""}` : "WhatsApp desconectado"}
    </Link>
  );
}

function Unread() {
  const { data } = useApi<Array<{ unread: number }>>("/api/inbox?filter=unread", { refreshInterval: 15_000 });
  const n = data?.length ?? 0;
  return n ? <span className="ml-auto rounded-full bg-heat px-1.5 font-mono text-[11px] text-white">{n}</span> : null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <aside
          className={`fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-ink text-white transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="px-5 pt-6 pb-8">
            <span className="font-display text-xl font-extrabold tracking-tight">
              prospec<span className="text-heat">.</span>
            </span>
            <p className="mt-0.5 text-[11px] tracking-wide text-white/40 uppercase">captação de clientes</p>
          </div>
          <nav className="flex-1 space-y-0.5 px-3">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
                  active(n.href) ? "bg-white/10 font-medium text-white" : "text-white/65 hover:bg-white/5 hover:text-white"
                }`}
              >
                {n.label}
                {n.badge && <Unread />}
              </Link>
            ))}
          </nav>
          <div className="space-y-1 border-t border-white/10 p-3">
            <WhatsAppStatus />
            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/login";
              }}
              className="w-full rounded-lg px-3 py-2 text-left text-xs text-white/50 hover:bg-white/5 hover:text-white"
            >
              Sair
            </button>
          </div>
        </aside>
        {open && <div className="fixed inset-0 z-20 bg-ink/40 lg:hidden" onClick={() => setOpen(false)} />}
        <div className="min-w-0 flex-1 lg:pl-60">
          <div className="flex items-center gap-3 border-b border-line bg-card px-4 py-3 lg:hidden">
            <button onClick={() => setOpen(true)} className="rounded-lg border border-line px-3 py-1.5 text-sm" aria-label="Abrir menu">
              Menu
            </button>
            <span className="font-display font-extrabold">
              prospec<span className="text-heat">.</span>
            </span>
          </div>
          <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
