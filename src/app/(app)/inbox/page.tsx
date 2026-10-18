"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  ArrowLeft,
  Bot,
  ExternalLink,
  Inbox as InboxIcon,
  LoaderCircle,
  MessageSquarePlus,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Send,
  Sparkles,
  Tag,
} from "lucide-react";
import { ChatPanel, MessageStatus } from "@/components/chat";
import { Heat, SiteBadge, Toggle, api, formatPhone, initials, timeAgo, useAction, useApi } from "@/components/ui";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  name: string;
  phone: string | null;
  unread: number;
  aiEnabled: boolean;
  optOut: boolean;
  lastMessageAt: string;
  stage: { name: string; color: string } | null;
  messages: { body: string; direction: string; status: string; author: string }[];
};
type InboxData = { items: Row[]; counts: Record<string, number>; unreadTotal: number };
type Lead = {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  category: string | null;
  website: string | null;
  websiteStatus: string | null;
  score: number;
  tags: string[];
  stageId: string | null;
  stage: { id: string; name: string; color: string } | null;
  aiEnabled: boolean;
  agentId: string | null;
  optOut: boolean;
  waExists: boolean | null;
};

const FILTERS = [
  { id: "all", label: "Todas" },
  { id: "unread", label: "Não lidas" },
  { id: "human", label: "Aguardando" },
  { id: "ai", label: "IA" },
];

function ConversationItem({ r, active, onClick }: { r: Row; active: boolean; onClick: () => void }) {
  const last = r.messages[0];
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
        active ? "bg-accent" : "hover:bg-accent/60",
      )}
    >
      <Avatar className="size-10">
        <AvatarFallback className={cn(r.unread > 0 && "bg-primary text-primary-foreground")}>{initials(r.name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-sm", r.unread > 0 ? "font-semibold" : "font-medium")}>{r.name}</span>
          <span className={cn("shrink-0 text-[11px] tabular-nums", r.unread > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
            {timeAgo(r.lastMessageAt)}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          {last?.direction === "OUT" && <MessageStatus status={last.status} className="text-muted-foreground size-3.5" />}
          {last?.direction === "OUT" && last.author === "ai" && <Sparkles className="text-muted-foreground size-3 shrink-0" />}
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">{last?.body ?? "—"}</span>
          {r.aiEnabled && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              IA
            </Badge>
          )}
          {r.unread > 0 && (
            <span className="bg-primary text-primary-foreground flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums">
              {r.unread}
            </span>
          )}
        </span>
        {r.stage && (
          <span className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: r.stage.color }}>
            <span className="size-1.5 rounded-full" style={{ background: r.stage.color }} />
            {r.stage.name}
          </span>
        )}
      </span>
    </button>
  );
}

function NewConversation({ open, onOpenChange, connected }: { open: boolean; onOpenChange: (v: boolean) => void; connected: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const { run, busy } = useAction();
  useEffect(() => {
    if (!open) {
      setPhone("");
      setName("");
      setText("");
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
          <DialogDescription>Envie uma mensagem para qualquer número. Se ainda não for um lead, ele é criado automaticamente.</DialogDescription>
        </DialogHeader>
        <form
          id="new-conversation"
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() => api<{ leadId: string; created: boolean }>("/api/whatsapp/send", { body: { phone, name, text } }), (x) =>
              x.created ? "Lead criado e mensagem enviada" : "Mensagem enviada",
            );
            if (r) {
              onOpenChange(false);
              router.replace(`/inbox?lead=${r.leadId}`);
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="nc-phone">WhatsApp</Label>
              <Input id="nc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-8888" inputMode="tel" className="font-mono" autoFocus />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nc-name">Nome (opcional)</Label>
              <Input id="nc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Padaria Pão Quente" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nc-text">Mensagem</Label>
            <Textarea id="nc-text" value={text} onChange={(e) => setText(e.target.value)} rows={4} className="field-sizing-fixed" placeholder="Olá! Tudo bem?" />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="new-conversation" disabled={busy || !connected || phone.replace(/\D/g, "").length < 10 || !text.trim()}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Send />}
            Enviar
          </Button>
        </DialogFooter>
        {!connected && <p className="text-destructive text-xs">Conecte o WhatsApp antes de iniciar uma conversa.</p>}
      </DialogContent>
    </Dialog>
  );
}

function LeadPanel({ lead, onChange }: { lead: Lead; onChange: () => void }) {
  const { data: stages } = useApi<Array<{ id: string; name: string }>>("/api/stages");
  const { data: agents } = useApi<Array<{ id: string; name: string }>>("/api/agents");
  const { run, busy } = useAction();
  const [tag, setTag] = useState("");
  const patch = async (body: Record<string, unknown>, msg: string) => {
    await run(() => api(`/api/leads/${lead.id}`, { method: "PATCH", body }), msg);
    onChange();
  };
  return (
    <div className="scroll-thin flex h-full flex-col gap-5 overflow-y-auto p-4">
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <Avatar className="size-16">
          <AvatarFallback className="text-lg">{initials(lead.name)}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold">{lead.name}</p>
          <p className="text-muted-foreground font-mono text-xs">{formatPhone(lead.phone)}</p>
          {(lead.category || lead.city) && <p className="text-muted-foreground mt-0.5 text-xs">{[lead.category, lead.city].filter(Boolean).join(" · ")}</p>}
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          <SiteBadge status={lead.websiteStatus} />
          {lead.optOut && <Badge variant="destructive">opt-out</Badge>}
          {lead.waExists === false && <Badge variant="destructive">sem WhatsApp</Badge>}
        </div>
        <Heat score={lead.score} />
      </div>
      <Separator />

      <section className="grid gap-3">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Atendimento</p>
        <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
          <span className="flex items-center gap-2 text-sm">
            <Bot className="text-muted-foreground size-4" />
            Respostas da IA
          </span>
          <Toggle checked={lead.aiEnabled} disabled={busy} onChange={(v) => patch({ aiEnabled: v }, v ? "IA ligada" : "IA pausada")} />
        </div>
        <div className="grid gap-2">
          <Label className="text-xs">Agente</Label>
          <NativeSelect value={lead.agentId ?? ""} onChange={(e) => patch({ agentId: e.target.value || null }, "Agente alterado")}>
            <option value="">Agente padrão</option>
            {agents?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || lead.optOut}
          onClick={async () => {
            await run(() => api(`/api/leads/${lead.id}/messages`, { body: { aiReplyNow: true } }), "A IA vai responder em instantes");
            onChange();
          }}
        >
          <Sparkles />
          IA responder agora
        </Button>
      </section>

      <section className="grid gap-2">
        <Label className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Etapa do funil</Label>
        <NativeSelect value={lead.stageId ?? ""} onChange={(e) => patch({ stageId: e.target.value }, "Etapa alterada")}>
          {!lead.stageId && <option value="">Sem etapa</option>}
          {stages?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </NativeSelect>
      </section>

      <section className="grid gap-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Tags</p>
        <div className="flex flex-wrap gap-1.5">
          {lead.tags.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1 pr-1">
              {t}
              <button
                className="hover:text-destructive rounded-sm px-0.5"
                aria-label={`Remover tag ${t}`}
                onClick={() => patch({ tags: lead.tags.filter((x) => x !== t) }, "Tag removida")}
              >
                ✕
              </button>
            </Badge>
          ))}
          {!lead.tags.length && <span className="text-muted-foreground text-xs">Nenhuma tag.</span>}
        </div>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const t = tag.trim().toLowerCase();
            if (!t || lead.tags.includes(t)) return;
            await patch({ tags: [...lead.tags, t] }, "Tag adicionada");
            setTag("");
          }}
        >
          <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="nova tag" className="h-8" />
          <Button type="submit" variant="outline" size="sm" disabled={!tag.trim()}>
            <Tag />
          </Button>
        </form>
      </section>

      <div className="mt-auto grid gap-2 pt-2">
        {lead.website && (
          <Button variant="ghost" size="sm" asChild className="justify-start">
            <a href={/^https?:/.test(lead.website) ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer">
              <ExternalLink />
              <span className="truncate">{lead.website}</span>
            </a>
          </Button>
        )}
        <Button variant="secondary" size="sm" asChild>
          <Link href={`/leads/${lead.id}`}>Abrir ficha completa</Link>
        </Button>
      </div>
    </div>
  );
}

function Inbox() {
  const sp = useSearchParams();
  const router = useRouter();
  const selected = sp.get("lead");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [panel, setPanel] = useState(true);
  const [panelSheet, setPanelSheet] = useState(false);

  // espera o usuário parar de digitar antes de buscar
  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const { data, mutate } = useApi<InboxData>(`/api/inbox?filter=${filter}&q=${encodeURIComponent(query)}`, { refreshInterval: 4000 });
  const { data: lead, mutate: mutateLead } = useApi<Lead>(selected ? `/api/leads/${selected}` : null, { refreshInterval: 15_000 });
  const { data: wa } = useApi<{ status: string }>("/api/whatsapp", { refreshInterval: 30_000 });
  const connected = wa ? wa.status === "WORKING" : true;
  const refresh = () => {
    mutate();
    mutateLead();
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden lg:h-screen">
      {/* ---------- lista ---------- */}
      <aside className={cn("bg-background flex min-h-0 w-full shrink-0 flex-col border-r md:w-[340px]", selected ? "hidden md:flex" : "flex")}>
        <div className="space-y-3 border-b p-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold tracking-tight">Conversas</h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-sm" variant="outline" onClick={() => setNewOpen(true)} aria-label="Nova conversa">
                  <MessageSquarePlus />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Nova conversa</TooltipContent>
            </Tooltip>
          </div>
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input placeholder="Buscar por nome ou telefone" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList className="w-full">
              {FILTERS.map((f) => (
                <TabsTrigger key={f.id} value={f.id} className="text-xs">
                  {f.label}
                  {data && data.counts[f.id] > 0 && <span className="text-muted-foreground tabular-nums">{data.counts[f.id]}</span>}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
          {!data &&
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-3 px-3 py-2.5">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          {data?.items.length === 0 && (
            <div className="text-muted-foreground flex flex-col items-center gap-2 px-6 py-16 text-center text-sm">
              <InboxIcon className="size-8 opacity-50" />
              {query ? "Nenhuma conversa encontrada." : "Nenhuma conversa aqui."}
              {!query && filter === "all" && (
                <Button variant="link" size="sm" onClick={() => setNewOpen(true)}>
                  Iniciar uma conversa
                </Button>
              )}
            </div>
          )}
          <div className="space-y-0.5">
            {data?.items.map((r) => (
              <ConversationItem key={r.id} r={r} active={selected === r.id} onClick={() => router.replace(`/inbox?lead=${r.id}`)} />
            ))}
          </div>
        </div>
      </aside>

      {/* ---------- chat ---------- */}
      <section className={cn("min-w-0 flex-1 flex-col", selected ? "flex" : "hidden md:flex")}>
        {selected && lead ? (
          <>
            <header className="bg-background flex h-16 shrink-0 items-center gap-3 border-b px-3 sm:px-4">
              <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => router.replace("/inbox")} aria-label="Voltar">
                <ArrowLeft />
              </Button>
              <Avatar className="size-9">
                <AvatarFallback>{initials(lead.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <Link href={`/leads/${lead.id}`} className="block truncate font-semibold hover:underline">
                  {lead.name}
                </Link>
                <p className="text-muted-foreground truncate font-mono text-xs">{formatPhone(lead.phone)}</p>
              </div>
              {lead.stage && (
                <Badge variant="outline" className="hidden sm:inline-flex" style={{ color: lead.stage.color, borderColor: lead.stage.color + "55" }}>
                  {lead.stage.name}
                </Badge>
              )}
              <Badge variant={lead.aiEnabled ? "default" : "secondary"} className="hidden sm:inline-flex">
                <Bot />
                {lead.aiEnabled ? "IA ativa" : "Humano"}
              </Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => (window.matchMedia("(min-width: 1280px)").matches ? setPanel((p) => !p) : setPanelSheet(true))}
                    aria-label="Detalhes do lead"
                  >
                    {panel ? <PanelRightClose /> : <PanelRightOpen />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Detalhes do lead</TooltipContent>
              </Tooltip>
            </header>
            <div className="min-h-0 flex-1">
              <ChatPanel leadId={lead.id} leadName={lead.name} aiEnabled={lead.aiEnabled} onChange={refresh} showToolbar={false} connected={connected} />
            </div>
          </>
        ) : selected ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="chat-wallpaper flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="bg-background flex size-14 items-center justify-center rounded-full border shadow-xs">
              <MessageSquarePlus className="text-muted-foreground size-6" />
            </span>
            <div>
              <p className="font-semibold">Escolha uma conversa</p>
              <p className="text-muted-foreground mt-1 text-sm">ou comece uma nova com qualquer número.</p>
            </div>
            <Button onClick={() => setNewOpen(true)}>
              <MessageSquarePlus />
              Nova conversa
            </Button>
          </div>
        )}
      </section>

      {/* ---------- detalhes do lead ---------- */}
      {selected && lead && panel && (
        <aside className="bg-background hidden w-[300px] shrink-0 border-l xl:block">
          <LeadPanel lead={lead} onChange={refresh} />
        </aside>
      )}
      <Sheet open={panelSheet} onOpenChange={setPanelSheet}>
        <SheetContent className="w-[320px] p-0">
          <SheetTitle className="sr-only">Detalhes do lead</SheetTitle>
          {lead && <LeadPanel lead={lead} onChange={refresh} />}
        </SheetContent>
      </Sheet>

      <NewConversation open={newOpen} onOpenChange={setNewOpen} connected={connected} />
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense>
      <Inbox />
    </Suspense>
  );
}
