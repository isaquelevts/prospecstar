"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bot,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  ScanSearch,
  Send,
  Settings,
  Smartphone,
  SquareKanban,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { ToastProvider, useApi } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: boolean };

const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: "Atendimento",
    items: [
      { href: "/", label: "Painel", icon: LayoutDashboard },
      { href: "/inbox", label: "Conversas", icon: MessagesSquare, badge: true },
      { href: "/whatsapp", label: "WhatsApp", icon: Smartphone },
    ],
  },
  {
    title: "Vendas",
    items: [
      { href: "/leads", label: "Leads", icon: Users },
      { href: "/pipeline", label: "Funil", icon: SquareKanban },
      { href: "/scraper", label: "Captação", icon: ScanSearch },
      { href: "/campaigns", label: "Disparos", icon: Send },
    ],
  },
  {
    title: "Automação",
    items: [
      { href: "/agents", label: "Agentes IA", icon: Bot },
      { href: "/flows", label: "Automações", icon: Workflow },
      { href: "/settings", label: "Configurações", icon: Settings },
    ],
  },
];

type WA = { status: string; me?: { id: string; pushName?: string } | null };

function WhatsAppStatus({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useApi<WA>("/api/whatsapp", { refreshInterval: 30_000 });
  const ok = data?.status === "WORKING";
  const waiting = data?.status === "SCAN_QR_CODE" || data?.status === "STARTING";
  return (
    <Link
      href="/whatsapp"
      onClick={onNavigate}
      className="hover:bg-sidebar-accent flex items-center gap-3 rounded-lg border bg-background p-2.5 text-left transition-colors"
    >
      <span className="relative flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <Smartphone className="size-4" />
        <span
          className={cn(
            "ring-background absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2",
            ok ? "bg-whatsapp" : waiting ? "bg-amber-500" : "bg-destructive",
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">
          {!data ? "Verificando…" : ok ? "WhatsApp conectado" : waiting ? "Aguardando QR code" : "WhatsApp desconectado"}
        </span>
        <span className="text-muted-foreground block truncate text-[11px]">
          {ok ? data?.me?.pushName || data?.me?.id.split("@")[0] : "Clique para conectar"}
        </span>
      </span>
    </Link>
  );
}

function Unread() {
  const { data } = useApi<{ unreadTotal: number }>("/api/inbox?filter=unread", { refreshInterval: 15_000 });
  const n = data?.unreadTotal ?? 0;
  return n ? (
    <span className="bg-primary text-primary-foreground ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums">
      {n > 99 ? "99+" : n}
    </span>
  ) : null;
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 px-4">
        <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-bold">p.</span>
        <div className="leading-tight">
          <p className="text-sm font-semibold">prospec.</p>
          <p className="text-muted-foreground text-[11px]">captação de clientes</p>
        </div>
      </div>
      <nav className="scroll-thin flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {NAV.map((group) => (
          <div key={group.title}>
            <p className="text-muted-foreground mb-1 px-2 text-xs font-medium">{group.title}</p>
            <ul className="space-y-0.5">
              {group.items.map((n) => (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    onClick={onNavigate}
                    aria-current={active(n.href) ? "page" : undefined}
                    className={cn(
                      "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors [&_svg]:size-4 [&_svg]:shrink-0",
                      active(n.href)
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <n.icon />
                    {n.label}
                    {n.badge && <Unread />}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="space-y-2 border-t p-3">
        <WhatsAppStatus onNavigate={onNavigate} />
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground w-full justify-start"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
        >
          <LogOut />
          Sair
        </Button>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  // a tela de conversas ocupa a altura toda, sem o respiro das outras páginas
  const fullBleed = path.startsWith("/inbox");

  return (
    <ToastProvider>
      <div className="bg-sidebar flex min-h-screen">
        <aside className="bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-30 hidden w-60 border-r lg:block">
          <SidebarBody />
        </aside>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="bg-sidebar w-72 p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SidebarBody onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="min-w-0 flex-1 lg:pl-60">
          <header className="bg-background sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 lg:hidden">
            <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Abrir menu">
              <Menu />
            </Button>
            <span className="text-sm font-semibold">prospec.</span>
          </header>
          <main className={cn("bg-background min-h-[calc(100vh-3.5rem)] lg:min-h-screen", fullBleed ? "" : "mx-auto max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8")}>
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
