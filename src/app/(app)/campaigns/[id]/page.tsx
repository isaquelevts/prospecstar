"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CircleAlert, CircleCheck, Copy, MoreHorizontal, Pause, Play, RefreshCw, RotateCw, Search, Trash2, TriangleAlert } from "lucide-react";
import { Badge, Button, Card, Field, Input, Select, Textarea, Toggle, api, formatPhone, timeAgo, useAction, useApi } from "@/components/ui";
import { Button as IconButton } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CAMPAIGN_STATUS } from "@/components/labels";
import { DEFAULT_TEMPLATES } from "@/lib/campaign-defaults";
import { BOOKING_STATUS_LABEL, MODALITY_LABEL } from "@/lib/arena";
import { TEMPLATE_VARIABLES } from "@/lib/template";

type Filter = {
  stageId?: string;
  tag?: string;
  websiteStatus?: string[];
  bookingStatus?: string[];
  modalities?: string[];
  minReviews?: number;
  city?: string;
  category?: string;
  minScore?: number;
  neverContacted?: boolean;
  scrapeJobId?: string;
};
type Campaign = {
  id: string;
  name: string;
  status: string;
  templates: string[];
  filter: Filter;
  minDelaySec: number;
  maxDelaySec: number;
  dailyLimit: number;
  windowStart: string;
  windowEnd: string;
  weekdays: number[];
  agentId: string | null;
  moveToStageId: string | null;
  waitReason?: string | null;
  nextRunAt?: string | null;
  lastError?: string | null;
};
type Target = {
  id: string;
  status: string;
  sentAt: string | null;
  repliedAt: string | null;
  error: string | null;
  message: string | null;
  lead: { id: string; name: string; phone: string | null; city: string | null; score: number };
};
type Detail = {
  campaign: Campaign;
  targets: Target[];
  total: number;
  counts: { pending: number; sent: number; failed: number; skipped: number; replied: number };
  sentToday: number;
  globalSentToday: number;
  dailyLimitGlobal: number;
  next: { leadId: string; name: string } | null;
  lastSent: { leadId: string; name: string; sentAt: string | null; message: string | null } | null;
};
type Preview = { count: number; examples: { lead: string; text: string }[]; variations: string[]; sampleLead: string | null };
type Check = { level: "ok" | "warn" | "error"; text: string; hint?: string; href?: string };

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TARGET_STATUS: Record<string, string> = { PENDING: "Na fila", SENDING: "Enviando", SENT: "Enviada", FAILED: "Falhou", SKIPPED: "Ignorada" };
const TARGET_COLOR: Record<string, string> = { PENDING: "#6b7280", SENDING: "#2340e8", SENT: "#138a52", FAILED: "#c9302c", SKIPPED: "#b7791f" };
const FORM_KEYS = ["name", "templates", "filter", "minDelaySec", "maxDelaySec", "dailyLimit", "windowStart", "windowEnd", "weekdays", "agentId", "moveToStageId"] as const;

const pickForm = (c: Campaign) => Object.fromEntries(FORM_KEYS.map((k) => [k, c[k]]));
const snapshot = (c: Campaign) => JSON.stringify(pickForm(c));
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const fmtSec = (s: number) => (s < 90 ? `${s}s` : `${(s / 60).toFixed(s % 60 ? 1 : 0).replace(".", ",")} min`);
const KNOWN_VARS = new Set(TEMPLATE_VARIABLES.concat(["empresa"]));

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Envios por dia que cabem de verdade: limite, janela de horário e intervalo médio entre mensagens. */
function capacityPerDay(c: Campaign, globalLimit: number) {
  const windowSec = Math.max(0, toMin(c.windowEnd) - toMin(c.windowStart)) * 60;
  const avg = Math.max(1, (c.minDelaySec + c.maxDelaySec) / 2);
  return Math.max(0, Math.min(c.dailyLimit, globalLimit, Math.floor(windowSec / avg)));
}

/** Dia estimado de término, contando só os dias da semana em que a campanha envia. */
function finishDate(pending: number, perDay: number, weekdays: number[]) {
  if (!pending || !perDay || !weekdays.length) return null;
  let left = pending;
  const d = new Date();
  for (let i = 0; i < 400; i++) {
    if (weekdays.includes(d.getDay())) {
      left -= perDay;
      if (left <= 0) return { date: new Date(d), days: i + 1 };
    }
    d.setDate(d.getDate() + 1);
  }
  return null;
}

function Kpi({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "bad" }) {
  return (
    <Card className="p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "bad" ? "text-destructive" : ""}`}>{value}</p>
      {note && <p className="text-muted-foreground mt-0.5 text-xs">{note}</p>}
    </Card>
  );
}

/** Grupo de botões liga/desliga para filtros de múltipla escolha. */
function ChipGroup({ label, options, value, onChange }: { label: string; options: Record<string, string>; value?: string[]; onChange: (v: string[] | undefined) => void }) {
  return (
    <div className="mt-4">
      <span className="mb-1.5 block text-[13px] font-medium">{label}</span>
      <div className="flex flex-wrap gap-2">
        {Object.entries(options).map(([k, text]) => {
          const on = value?.includes(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                const cur = new Set(value ?? []);
                if (on) cur.delete(k);
                else cur.add(k);
                onChange(cur.size ? [...cur] : undefined);
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs ${on ? "border-primary bg-accent font-medium" : "text-muted-foreground hover:border-foreground/30"}`}
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [section, setSection] = useState<string | null>(null);
  const [tab, setTab] = useState("");
  const [q, setQ] = useState("");
  const [take, setTake] = useState(100);
  const [openId, setOpenId] = useState<string | null>(null);
  const dq = useDebounced(q.trim(), 300);

  const { data, mutate } = useApi<Detail>(`/api/campaigns/${id}?status=${tab}&q=${encodeURIComponent(dq)}&take=${take}`, { refreshInterval: 8000, keepPreviousData: true });
  const { data: stages } = useApi<Array<{ id: string; name: string }>>("/api/stages");
  const { data: agents } = useApi<Array<{ id: string; name: string }>>("/api/agents");
  const { data: wa } = useApi<{ status: string }>("/api/whatsapp", { refreshInterval: 30_000 });

  const [c, setC] = useState<Campaign | null>(null);
  const [saved, setSaved] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const { run, busy } = useAction();
  const areas = useRef<Array<HTMLTextAreaElement | null>>([]);
  const focused = useRef(0);

  // carrega o formulário uma vez; depois só o que o usuário edita (o servidor atualiza status e contagens por fora)
  useEffect(() => {
    if (data && !c) {
      setC(data.campaign);
      setSaved(snapshot(data.campaign));
    }
  }, [data, c]);
  useEffect(() => {
    if (data && section === null) setSection(data.campaign.status === "DRAFT" ? "config" : "overview");
  }, [data, section]);

  const dirty = !!c && snapshot(c) !== saved;

  // avisa antes de sair com alterações não salvas
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // prévia ao vivo (com debounce) do público e das mensagens
  useEffect(() => {
    if (!c) return;
    const t = setTimeout(() => {
      api<Preview>("/api/campaigns/preview", { body: { templates: c.templates, filter: c.filter } })
        .then(setPreview)
        .catch(() => null);
    }, 500);
    return () => clearTimeout(t);
  }, [c?.templates, c?.filter, previewKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = data?.campaign.status ?? "DRAFT";
  const globalLimit = data?.dailyLimitGlobal ?? 60;

  const checks = useMemo<Check[]>(() => {
    if (!c) return [];
    const out: Check[] = [];
    const valid = c.templates.filter((t) => t.trim());
    out.push(
      wa?.status === "WORKING"
        ? { level: "ok", text: "WhatsApp conectado" }
        : { level: "warn", text: "WhatsApp desconectado", hint: "Os envios só começam quando o número estiver conectado.", href: "/whatsapp" },
    );
    if (!valid.length) out.push({ level: "error", text: "Nenhuma mensagem escrita", hint: "Adicione pelo menos uma mensagem em Configurar." });
    else {
      const bad = valid.findIndex((t) => (t.match(/\{/g)?.length ?? 0) !== (t.match(/\}/g)?.length ?? 0));
      const unknown = valid.flatMap((t) => [...t.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1].toLowerCase())).find((v) => !KNOWN_VARS.has(v));
      if (bad >= 0) out.push({ level: "error", text: `Chaves { } desbalanceadas na mensagem ${bad + 1}`, hint: "Cada { precisa de um } — senão a mensagem sai com o texto quebrado." });
      else if (unknown) out.push({ level: "warn", text: `Variável desconhecida: {{${unknown}}}`, hint: "Ela sairia vazia na mensagem." });
      else if (valid.length < 3) out.push({ level: "warn", text: `${valid.length === 1 ? "Só 1 mensagem" : "Só 2 mensagens"}`, hint: "Use 3 ou mais variações: textos iguais para muita gente aumentam o risco de bloqueio." });
      else out.push({ level: "ok", text: `${valid.length} variações de mensagem` });
    }
    if (preview) {
      out.push(preview.count > 0 ? { level: "ok", text: `${preview.count} lead${preview.count > 1 ? "s" : ""} no público` } : { level: "error", text: "Nenhum lead no público", hint: "Ajuste os filtros em Configurar." });
    }
    if (c.maxDelaySec < c.minDelaySec) out.push({ level: "error", text: "Intervalo máximo menor que o mínimo" });
    else if (c.minDelaySec < 60) out.push({ level: "warn", text: `Intervalo mínimo de ${c.minDelaySec}s`, hint: "Abaixo de 60 segundos entre mensagens aumenta o risco de bloqueio." });
    else out.push({ level: "ok", text: `Intervalo de ${fmtSec(c.minDelaySec)} a ${fmtSec(c.maxDelaySec)}` });
    if (!c.weekdays.length) out.push({ level: "error", text: "Nenhum dia da semana marcado" });
    else if (toMin(c.windowEnd) <= toMin(c.windowStart)) out.push({ level: "error", text: "O horário final é antes do inicial" });
    else {
      const cap = capacityPerDay(c, globalLimit);
      if (c.dailyLimit > globalLimit) out.push({ level: "warn", text: `Limite do número é ${globalLimit}/dia`, hint: "Vale o menor entre o da campanha e o do número (Configurações → Disparos)." });
      else if (c.dailyLimit > 40) out.push({ level: "warn", text: `${c.dailyLimit} envios por dia`, hint: "Para número recente, comece com 20–40/dia e aumente aos poucos." });
      else out.push({ level: "ok", text: `Limite de ${c.dailyLimit} envios por dia` });
      if (cap < Math.min(c.dailyLimit, globalLimit)) out.push({ level: "warn", text: `No ritmo atual cabem só ~${cap}/dia`, hint: "A janela de horário é curta para o limite e o intervalo escolhidos." });
    }
    if (!c.agentId) out.push({ level: "warn", text: "Sem agente de IA", hint: "As respostas ficam para você, na tela de Conversas." });
    else out.push({ level: "ok", text: "Agente de IA responde" });
    return out;
  }, [c, wa?.status, preview, globalLimit]);
  const blockers = checks.filter((x) => x.level === "error");

  if (!c || !data) return <p className="text-muted-foreground text-sm">Carregando…</p>;

  const live = data.campaign;
  const running = status === "RUNNING";
  const counts = data.counts;
  const totalAll = counts.pending + counts.sent + counts.failed + counts.skipped;
  const processed = totalAll - counts.pending;
  const perDay = capacityPerDay(c, globalLimit);
  const eta = finishDate(counts.pending, perDay, c.weekdays);
  const todayLimit = Math.min(c.dailyLimit, globalLimit);
  const nextAt = live.nextRunAt ? new Date(live.nextRunAt) : null;
  const nextLabel = nextAt && nextAt.getTime() > Date.now() ? nextAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
  const replyRate = counts.sent ? Math.round((counts.replied / counts.sent) * 100) : 0;
  const canResume = status === "PAUSED" || (status === "DONE" && counts.pending > 0);

  const set = (p: Partial<Campaign>) => setC({ ...c, ...p });
  const setFilter = (p: Partial<Filter>) => set({ filter: { ...c.filter, ...p } });

  const save = async () => {
    if (c.maxDelaySec < c.minDelaySec) {
      await run(async () => {
        throw new Error("O intervalo máximo não pode ser menor que o mínimo.");
      });
      return false;
    }
    const ok = await run(async () => {
      await api(`/api/campaigns/${id}`, { method: "PATCH", body: pickForm(c) });
      setSaved(snapshot(c));
      await mutate();
      return true;
    }, "Campanha salva");
    return !!ok;
  };

  const action = async (a: "start" | "pause", msg: (r: any) => string) => {
    if (a === "start") {
      if (blockers.length) {
        setSection("overview");
        await run(async () => {
          throw new Error(`Não dá para iniciar: ${blockers[0].text}.`);
        });
        return;
      }
      if (status === "DRAFT") {
        const n = preview?.count ?? 0;
        if (!confirm(`Iniciar disparos para ${n} lead${n > 1 ? "s" : ""}?\n\nUma mensagem por vez, entre ${fmtSec(c.minDelaySec)} e ${fmtSec(c.maxDelaySec)} de intervalo, até ${todayLimit} por dia.`)) return;
      }
      if (dirty && !(await save())) return;
    }
    await run(() => api(`/api/campaigns/${id}`, { body: { action: a } }), msg);
    mutate();
    if (a === "start") setSection("overview");
  };

  const targetAction = async (t: Target, a: "remove" | "retry") => {
    await run(
      () => (a === "remove" ? api(`/api/campaigns/${id}/recipients`, { method: "DELETE", body: { targetId: t.id } }) : api(`/api/campaigns/${id}`, { body: { action: "retry_one", targetId: t.id } })),
      a === "remove" ? "Removido da campanha" : "Voltou para a fila",
    );
    mutate();
  };

  const insertVar = (v: string) => {
    const i = Math.min(focused.current, c.templates.length - 1);
    const el = areas.current[i];
    const text = c.templates[i] ?? "";
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? start;
    const token = `{{${v}}}`;
    set({ templates: c.templates.map((x, j) => (j === i ? text.slice(0, start) + token + text.slice(end) : x)) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const checksCard = (
    <Card className="p-5">
      <h2 className="mb-3 font-semibold">Antes de disparar</h2>
      <ul className="space-y-2.5">
        {checks.map((x, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            {x.level === "ok" ? (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            ) : x.level === "warn" ? (
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
            ) : (
              <CircleAlert className="text-destructive mt-0.5 size-4 shrink-0" />
            )}
            <span>
              {x.text}
              {x.hint && <span className="text-muted-foreground block text-xs">{x.hint}</span>}
              {x.href && (
                <Link href={x.href} className="text-xs underline underline-offset-2">
                  Abrir
                </Link>
              )}
            </span>
          </li>
        ))}
      </ul>
      {blockers.length > 0 && <p className="text-destructive mt-3 text-xs">Resolva os itens em vermelho para iniciar.</p>}
    </Card>
  );

  const statusTabs: Array<[string, string, number]> = [
    ["", "Todos", totalAll],
    ["PENDING", "Na fila", counts.pending],
    ["SENT", "Enviadas", counts.sent],
    ["FAILED", "Falhas", counts.failed],
    ["SKIPPED", "Ignoradas", counts.skipped],
  ];

  return (
    <>
      <Link href="/campaigns" className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-xs">
        <ArrowLeft className="size-3" /> Disparos
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{c.name || "Campanha sem nome"}</h1>
          <p className="text-muted-foreground mt-1 inline-flex flex-wrap items-center gap-2 text-sm">
            <Badge color={CAMPAIGN_STATUS[status]?.color}>{CAMPAIGN_STATUS[status]?.label}</Badge>
            {counts.sent} enviadas · {counts.pending} na fila · {counts.replied} respostas
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">Alterações não salvas</span>}
          <Button variant={dirty ? "primary" : "outline"} disabled={busy || !dirty} onClick={save}>
            Salvar
          </Button>
          {running ? (
            <Button variant="danger" disabled={busy} onClick={() => action("pause", () => "Campanha pausada")}>
              <Pause className="size-4" />
              Pausar
            </Button>
          ) : (
            <Button variant={dirty ? "outline" : "primary"} disabled={busy || (status === "DONE" && !canResume)} onClick={() => action("start", (r) => (r.added ? `Disparos iniciados para ${r.pending} leads` : "Disparos retomados"))}>
              <Play className="size-4" />
              {canResume ? "Retomar" : "Iniciar disparos"}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton variant="outline" size="icon" aria-label="Mais ações">
                <MoreHorizontal />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={async () => {
                  const r = await run(() => api<{ id: string }>(`/api/campaigns/${id}`, { body: { action: "duplicate" } }), "Campanha duplicada");
                  if (r) router.push(`/campaigns/${r.id}`);
                }}
              >
                <Copy /> Duplicar campanha
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={running}
                onClick={async () => {
                  if (!confirm("Excluir esta campanha? O histórico de mensagens dos leads é mantido.")) return;
                  await run(() => api(`/api/campaigns/${id}`, { method: "DELETE" }), "Campanha excluída");
                  router.push("/campaigns");
                }}
              >
                <Trash2 /> Excluir campanha
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {running && (
        <div className="bg-accent mb-6 flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3 text-sm">
          <span className="bg-primary size-2 animate-pulse rounded-full" />
          <span className="font-medium">{live.waitReason ?? (nextLabel ? `Próximo envio por volta das ${nextLabel}` : "Enviando…")}</span>
          {live.waitReason && nextLabel && <span className="text-muted-foreground">· verifica de novo às {nextLabel}</span>}
        </div>
      )}
      {!running && live.lastError && (
        <div className="border-destructive/30 bg-destructive/5 text-destructive mb-6 rounded-lg border px-4 py-3 text-sm">
          <p className="font-medium">{status === "PAUSED" ? "Campanha pausada" : "Último erro"}</p>
          <p className="mt-0.5 break-words">{live.lastError}</p>
          {status === "PAUSED" && <p className="mt-1 text-xs">Confira a tela WhatsApp e clique em Retomar.</p>}
        </div>
      )}
      {status === "DONE" && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          <CircleCheck className="size-4 shrink-0" />
          <span className="flex-1">
            Campanha concluída: {counts.sent} enviadas, {counts.replied} respostas ({replyRate}%){counts.failed ? `, ${counts.failed} falhas` : ""}.
          </span>
        </div>
      )}

      <Tabs value={section ?? "overview"} onValueChange={setSection}>
        <TabsList className="mb-2 self-start">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="config">
            Configurar
            {dirty && <span className="ml-1.5 size-1.5 rounded-full bg-amber-500" />}
          </TabsTrigger>
        </TabsList>

        {/* ---------------- VISÃO GERAL ---------------- */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi label="Na fila" value={counts.pending} note={eta ? `termina ~${eta.date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}` : undefined} />
            <Kpi label="Enviadas" value={counts.sent} note={`hoje ${data.sentToday}/${todayLimit}`} />
            <Kpi label="Respostas" value={counts.replied} note={counts.sent ? `${replyRate}% de quem recebeu` : "—"} />
            <Kpi label="Falhas" value={counts.failed} tone={counts.failed ? "bad" : undefined} note={counts.failed ? "veja a aba Falhas" : "nenhuma"} />
            <Kpi label="Ignoradas" value={counts.skipped} note="sem WhatsApp, já conversa…" />
          </div>

          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium">Progresso</span>
              <span className="text-muted-foreground tabular-nums">
                {processed} de {totalAll} processados
                {eta ? ` · previsão: ${eta.days} dia${eta.days > 1 ? "s" : ""} de envio (~${perDay}/dia)` : ""}
              </span>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div className="bg-primary h-full rounded-full transition-all" style={{ width: totalAll ? `${(processed / totalAll) * 100}%` : 0 }} />
            </div>
          </Card>

          <div className="grid items-start gap-6 xl:grid-cols-[1fr_360px]">
            <Card>
              <div className="flex flex-wrap items-center gap-1 border-b px-4 py-3">
                {statusTabs.map(([key, label, n]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setTab(key);
                      setTake(100);
                    }}
                    className={`rounded-md px-2.5 py-1 text-xs ${tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {label} <span className="tabular-nums opacity-70">{n}</span>
                  </button>
                ))}
                <div className="relative ml-auto w-full sm:w-56">
                  <Search className="text-muted-foreground absolute top-2 left-2.5 size-3.5" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nome ou telefone" className="h-8 pl-8 text-xs" />
                </div>
                {counts.failed > 0 && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={async () => { await run(() => api<{ reset: number }>(`/api/campaigns/${id}`, { body: { action: "reset_failed" } }), (r) => `${r.reset} falhas voltaram para a fila`); mutate(); }}>
                    <RotateCw className="size-3.5" />
                    Tentar todas as falhas
                  </Button>
                )}
              </div>
              {data.targets.length === 0 ? (
                <p className="text-muted-foreground p-8 text-center text-sm">
                  {dq ? "Ninguém encontrado com essa busca." : totalAll === 0 ? "Ainda não há ninguém na fila. Ao clicar em “Iniciar disparos”, os leads do filtro entram automaticamente." : "Nada nesta aba."}
                </p>
              ) : (
                <ul className="divide-y text-sm">
                  {data.targets.map((t, i) => (
                    <li key={t.id} className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-3">
                        {tab === "PENDING" && <span className="text-muted-foreground w-6 text-right font-mono text-xs tabular-nums">{i + 1}</span>}
                        <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => setOpenId(openId === t.id ? null : t.id)} title="Ver detalhes">
                          {t.lead.name}
                          <span className="text-muted-foreground ml-2 font-mono text-xs">{formatPhone(t.lead.phone)}</span>
                        </button>
                        {t.repliedAt && (
                          <Link href={`/inbox?lead=${t.lead.id}`}>
                            <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">respondeu</Badge>
                          </Link>
                        )}
                        <span className="text-muted-foreground text-xs">{t.sentAt ? timeAgo(t.sentAt) : ""}</span>
                        <Badge color={TARGET_COLOR[t.status]}>{TARGET_STATUS[t.status]}</Badge>
                        {t.status === "PENDING" && (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => targetAction(t, "remove")} aria-label={`Remover ${t.lead.name}`}>
                            Remover
                          </Button>
                        )}
                        {(t.status === "FAILED" || t.status === "SKIPPED") && (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => targetAction(t, "retry")}>
                            <RotateCw className="size-3.5" />
                            Tentar de novo
                          </Button>
                        )}
                      </div>
                      {openId === t.id && (
                        <div className="bg-muted/50 mt-2 space-y-2 rounded-lg p-3 text-xs">
                          {t.error && <p className="text-destructive break-words">{t.error}</p>}
                          {t.message && <p className="bg-background rounded-xl rounded-bl-sm border px-3 py-2 whitespace-pre-wrap">{t.message}</p>}
                          <div className="text-muted-foreground flex flex-wrap items-center gap-3">
                            {t.lead.city && <span>{t.lead.city}</span>}
                            <span>temperatura {t.lead.score}</span>
                            <Link href={`/leads/${t.lead.id}`} className="underline underline-offset-2">
                              Abrir lead
                            </Link>
                            {t.sentAt && (
                              <Link href={`/inbox?lead=${t.lead.id}`} className="underline underline-offset-2">
                                Abrir conversa
                              </Link>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {data.total > data.targets.length && (
                <div className="border-t p-3 text-center">
                  <Button size="sm" variant="outline" onClick={() => setTake(take + 100)}>
                    Mostrar mais ({data.targets.length} de {data.total})
                  </Button>
                </div>
              )}
            </Card>

            <div className="space-y-6">
              <Card className="space-y-3 p-5">
                <h2 className="font-semibold">Atividade</h2>
                <div className="text-sm">
                  <p className="text-muted-foreground text-xs">Próximo da fila</p>
                  {data.next ? (
                    <Link href={`/leads/${data.next.leadId}`} className="hover:underline">
                      {data.next.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Fila vazia</span>
                  )}
                </div>
                <div className="text-sm">
                  <p className="text-muted-foreground text-xs">Último envio{data.lastSent?.sentAt ? ` · ${timeAgo(data.lastSent.sentAt)}` : ""}</p>
                  {data.lastSent ? (
                    <>
                      <Link href={`/inbox?lead=${data.lastSent.leadId}`} className="hover:underline">
                        {data.lastSent.name}
                      </Link>
                      {data.lastSent.message && <p className="bg-muted mt-1 line-clamp-4 rounded-xl rounded-tl-sm px-3 py-2 text-xs whitespace-pre-wrap">{data.lastSent.message}</p>}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Nada enviado ainda</span>
                  )}
                </div>
                <p className="text-muted-foreground border-t pt-3 text-xs">
                  {c.dailyLimit}/dia · {fmtSec(c.minDelaySec)}–{fmtSec(c.maxDelaySec)} entre mensagens · {c.weekdays.map((d) => DAYS[d].toLowerCase()).join(", ")}, {c.windowStart}–{c.windowEnd}.{" "}
                  <button className="underline underline-offset-2" onClick={() => setSection("config")}>
                    Editar
                  </button>
                </p>
              </Card>

              {checksCard}
            </div>
          </div>
        </TabsContent>

        {/* ---------------- CONFIGURAR ---------------- */}
        <TabsContent value="config">
          <div className="grid items-start gap-6 xl:grid-cols-[1fr_380px]">
            <div className="space-y-6">
              <Card className="space-y-4 p-5">
                <Field label="Nome da campanha">
                  <Input value={c.name} onChange={(e) => set({ name: e.target.value })} />
                </Field>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[13px] font-medium">Mensagens</span>
                    <span className="text-muted-foreground text-xs">Uma variação é sorteada para cada lead</span>
                  </div>
                  <div className="space-y-3">
                    {c.templates.map((t, i) => (
                      <div key={i}>
                        <Textarea
                          ref={(el) => {
                            areas.current[i] = el;
                          }}
                          rows={4}
                          value={t}
                          onFocus={() => (focused.current = i)}
                          onChange={(e) => set({ templates: c.templates.map((x, j) => (j === i ? e.target.value : x)) })}
                          placeholder="{{saudacao}}, tudo bem? ..."
                        />
                        <div className="text-muted-foreground mt-1 flex items-center gap-3 text-xs">
                          <span className="font-medium">Variação {i + 1}</span>
                          <span className={t.length > 320 ? "text-amber-600" : ""}>{t.length} caracteres{t.length > 320 ? " — mensagens curtas costumam ter mais resposta" : ""}</span>
                          <span className="ml-auto flex gap-2">
                            <button className="hover:text-foreground" onClick={() => set({ templates: [...c.templates.slice(0, i + 1), t, ...c.templates.slice(i + 1)] })}>
                              duplicar
                            </button>
                            {c.templates.length > 1 && (
                              <button className="hover:text-destructive" onClick={() => set({ templates: c.templates.filter((_, j) => j !== i) })}>
                                remover
                              </button>
                            )}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => set({ templates: [...c.templates, ""] })}>
                      + Variação
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (c.templates.some((t) => t.trim()) && !confirm("Substituir as mensagens atuais pelas sugeridas?")) return;
                        set({ templates: [...DEFAULT_TEMPLATES] });
                      }}
                    >
                      Usar mensagens sugeridas
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1">
                    <span className="text-muted-foreground mr-1 text-xs">Inserir variável:</span>
                    {TEMPLATE_VARIABLES.map((v) => (
                      <button key={v} type="button" onClick={() => insertVar(v)} className="bg-muted hover:bg-accent rounded px-1.5 py-0.5 font-mono text-[11px]">
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                  <p className="text-muted-foreground mt-2 text-xs">
                    Use <code className="font-mono">{"{Oi|Olá|E aí}"}</code> para sortear palavras — cada lead recebe um texto um pouco diferente, o que reduz o risco de bloqueio.
                  </p>
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="mb-4 font-semibold">Quem vai receber</h2>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Etapa">
                    <Select value={c.filter.stageId ?? ""} onChange={(e) => setFilter({ stageId: e.target.value || undefined })}>
                      <option value="">Qualquer</option>
                      {stages?.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Tag">
                    <Input value={c.filter.tag ?? ""} onChange={(e) => setFilter({ tag: e.target.value || undefined })} />
                  </Field>
                  <Field label="Mínimo de avaliações no Google">
                    <Input type="number" min={0} value={c.filter.minReviews ?? ""} onChange={(e) => setFilter({ minReviews: e.target.value ? Number(e.target.value) : undefined })} />
                  </Field>
                  <Field label="Temperatura mínima">
                    <Input type="number" min={0} max={100} value={c.filter.minScore ?? ""} onChange={(e) => setFilter({ minScore: e.target.value ? Number(e.target.value) : undefined })} />
                  </Field>
                  <Field label="Cidade contém">
                    <Input value={c.filter.city ?? ""} onChange={(e) => setFilter({ city: e.target.value || undefined })} />
                  </Field>
                  <Field label="Segmento contém">
                    <Input value={c.filter.category ?? ""} onChange={(e) => setFilter({ category: e.target.value || undefined })} />
                  </Field>
                </div>
                <div className="mt-4">
                  <Toggle checked={!!c.filter.neverContacted} onChange={(v) => setFilter({ neverContacted: v || undefined })} label="Só quem nunca foi contatado" />
                </div>
                <ChipGroup label="Modalidade (qualquer uma das marcadas)" options={MODALITY_LABEL} value={c.filter.modalities} onChange={(modalities) => setFilter({ modalities })} />
                <ChipGroup
                  label="Como reserva hoje"
                  options={Object.fromEntries(Object.entries(BOOKING_STATUS_LABEL).filter(([k]) => k !== "CUSTOMER"))}
                  value={c.filter.bookingStatus}
                  onChange={(bookingStatus) => setFilter({ bookingStatus })}
                />
                <p className="text-muted-foreground mt-2 text-xs">Clientes do QuadrasFlow e leads na etapa de ganho nunca entram nas campanhas.</p>
                <div className="bg-muted mt-5 flex flex-wrap items-center gap-3 rounded-lg px-4 py-3 text-sm">
                  <span>
                    <strong className="text-lg">{preview?.count ?? "…"}</strong> leads podem receber
                    <span className="text-muted-foreground block text-xs">com WhatsApp, sem descadastro e que ainda não conversam com você{status === "DRAFT" ? " — entram na fila ao iniciar" : ""}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    disabled={busy}
                    onClick={async () => {
                      if (dirty && !(await save())) return;
                      await run(() => api<{ added: number }>(`/api/campaigns/${id}`, { body: { action: "populate" } }), (r) => `${r.added} leads adicionados à fila`);
                      mutate();
                    }}
                  >
                    {status === "DRAFT" ? "Adicionar à fila agora" : "Adicionar novos leads à fila"}
                  </Button>
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              {status === "DRAFT" && checksCard}
              <Card className="space-y-4 p-5">
                <h2 className="font-semibold">Ritmo de envio</h2>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Intervalo mínimo (s)" hint={fmtSec(c.minDelaySec)}>
                    <Input type="number" min={10} value={c.minDelaySec} onChange={(e) => set({ minDelaySec: Number(e.target.value) })} />
                  </Field>
                  <Field label="Intervalo máximo (s)" hint={fmtSec(c.maxDelaySec)}>
                    <Input type="number" min={10} value={c.maxDelaySec} onChange={(e) => set({ maxDelaySec: Number(e.target.value) })} />
                  </Field>
                  <Field label="Início">
                    <Input type="time" value={c.windowStart} onChange={(e) => set({ windowStart: e.target.value })} />
                  </Field>
                  <Field label="Fim">
                    <Input type="time" value={c.windowEnd} onChange={(e) => set({ windowEnd: e.target.value })} />
                  </Field>
                </div>
                <Field label="Limite por dia" hint={`Números novos: comece com 20–40/dia e aumente aos poucos. O número envia no máximo ${globalLimit}/dia somando todas as campanhas (Configurações → Disparos).`}>
                  <Input type="number" min={1} value={c.dailyLimit} onChange={(e) => set({ dailyLimit: Number(e.target.value) })} />
                </Field>
                <div className="flex flex-wrap gap-1">
                  {DAYS.map((d, i) => {
                    const on = c.weekdays.includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => set({ weekdays: on ? c.weekdays.filter((x) => x !== i) : [...c.weekdays, i].sort() })}
                        className={`h-8 w-11 rounded-md text-xs ${on ? "bg-primary text-primary-foreground" : "text-muted-foreground border"}`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
                <p className="text-muted-foreground bg-muted rounded-lg px-3 py-2 text-xs">
                  Na prática: cerca de <strong className="text-foreground">{perDay} envios por dia</strong>
                  {counts.pending ? (eta ? `, terminando a fila de ${counts.pending} em ~${eta.days} dia${eta.days > 1 ? "s" : ""} de envio` : "") : ""}.
                </p>
              </Card>

              <Card className="space-y-4 p-5">
                <h2 className="font-semibold">Quando responderem</h2>
                <Field label="Agente de IA que assume a conversa" hint="Sem agente, as respostas ficam para você na tela de Conversas.">
                  <Select value={c.agentId ?? ""} onChange={(e) => set({ agentId: e.target.value || null })}>
                    <option value="">Nenhum (atendimento manual)</option>
                    {agents?.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Mover lead após o envio para">
                  <Select value={c.moveToStageId ?? ""} onChange={(e) => set({ moveToStageId: e.target.value || null })}>
                    <option value="">Não mover</option>
                    {stages?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </Card>

              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">Prévia</h2>
                  <Button size="sm" variant="ghost" onClick={() => setPreviewKey((k) => k + 1)}>
                    <RefreshCw className="size-3.5" />
                    Sortear outro
                  </Button>
                </div>
                {preview?.variations.length ? (
                  <div className="space-y-3">
                    {preview.sampleLead && <p className="text-muted-foreground text-xs">Como cada variação sairia para {preview.sampleLead}:</p>}
                    {preview.variations.map((text, i) => (
                      <div key={i}>
                        <p className="text-muted-foreground mb-1 text-[11px]">Variação {i + 1}</p>
                        <p className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3.5 py-2 text-sm whitespace-pre-wrap">{text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Escreva a mensagem e ajuste o filtro para ver exemplos.</p>
                )}
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
