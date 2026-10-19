"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Copy, MoreHorizontal, Pause, Play, Plus, Send, Trash2, Users } from "lucide-react";
import { Badge, Button, Card, Empty, Modal, PageHeader, api, formatPhone, timeAgo, useAction, useApi } from "@/components/ui";
import { Button as IconButton } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CAMPAIGN_STATUS } from "@/components/labels";

type Campaign = {
  id: string;
  name: string;
  status: string;
  dailyLimit: number;
  sentToday: number;
  createdAt: string;
  startedAt: string | null;
  nextRunAt: string | null;
  waitReason?: string | null;
  lastError?: string | null;
  templates: string[];
  agent: { name: string } | null;
  stats: { pending: number; sending: number; sent: number; failed: number; skipped: number; replied: number };
};
type Summary = { sentToday: number; limit: number; sent7: number; replied7: number; replyRate: number; running: number };

const TABS: Array<{ key: string; label: string; match: (c: Campaign) => boolean }> = [
  { key: "all", label: "Todas", match: () => true },
  { key: "RUNNING", label: "Disparando", match: (c) => c.status === "RUNNING" },
  { key: "PAUSED", label: "Pausadas", match: (c) => c.status === "PAUSED" },
  { key: "DRAFT", label: "Rascunhos", match: (c) => c.status === "DRAFT" },
  { key: "DONE", label: "Concluídas", match: (c) => c.status === "DONE" },
];

function Tile({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-muted-foreground mt-0.5 text-xs">{note}</p>}
    </Card>
  );
}

export default function CampaignsPage() {
  const { data, mutate } = useApi<Campaign[]>("/api/campaigns", { refreshInterval: 10_000 });
  const { data: summary } = useApi<Summary>("/api/campaigns/summary", { refreshInterval: 15_000 });
  const { data: wa } = useApi<{ status: string; reachable: boolean }>("/api/whatsapp", { refreshInterval: 30_000 });
  const router = useRouter();
  const { run, busy } = useAction();
  const [tab, setTab] = useState("all");
  const [recipientsCampaign, setRecipientsCampaign] = useState<Campaign | null>(null);

  async function create() {
    // o servidor preenche nome, mensagens e filtro padrão (e reaproveita um rascunho vazio)
    const c = await run(() => api<{ id: string }>("/api/campaigns", { body: {} }));
    if (c) router.push(`/campaigns/${c.id}`);
  }
  async function act(c: Campaign, action: "start" | "pause" | "duplicate") {
    const r = await run(
      () => api<{ id?: string }>(`/api/campaigns/${c.id}`, { body: { action } }),
      action === "pause" ? "Campanha pausada" : action === "start" ? "Disparos retomados" : "Campanha duplicada",
    );
    if (action === "duplicate" && r?.id) router.push(`/campaigns/${r.id}`);
    else mutate();
  }
  async function remove(c: Campaign) {
    if (!confirm(`Excluir "${c.name}"? O histórico de mensagens dos leads é mantido.`)) return;
    await run(() => api(`/api/campaigns/${c.id}`, { method: "DELETE" }), "Campanha excluída");
    mutate();
  }

  const list = data?.filter((c) => TABS.find((t) => t.key === tab)!.match(c)) ?? [];
  const waDown = wa && wa.status !== "WORKING";

  return (
    <>
      <PageHeader
        title="Disparos"
        sub="Campanhas enviam uma mensagem por vez, com intervalos aleatórios e limite diário, para proteger seu número."
        actions={
          <Button onClick={create} disabled={busy}>
            <Plus className="size-4" />
            Nova campanha
          </Button>
        }
      />

      {waDown && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <CircleAlert className="size-4 shrink-0" />
          <span className="flex-1">WhatsApp desconectado — as campanhas em andamento ficam esperando e nada é enviado.</span>
          <Link href="/whatsapp" className="font-medium underline underline-offset-2">
            Conectar
          </Link>
        </div>
      )}

      {summary && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <Tile
            label="Enviadas hoje"
            value={
              <>
                {summary.sentToday}
                <span className="text-muted-foreground text-base font-normal"> / {summary.limit}</span>
              </>
            }
            note="limite diário do número (todas as campanhas)"
          />
          <Tile label="Taxa de resposta (7 dias)" value={`${summary.replyRate}%`} note={`${summary.replied7} respostas em ${summary.sent7} disparos`} />
          <Tile label="Disparando agora" value={summary.running} note={summary.running ? "campanhas ativas" : "nenhuma campanha ativa"} />
        </div>
      )}

      {data && data.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1">
          {TABS.map((t) => {
            const n = data.filter(t.match).length;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-md px-3 py-1.5 text-sm ${tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {t.label} <span className="tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {data?.length === 0 ? (
        <Empty title="Nenhuma campanha ainda" icon={<Send />}>
          Crie uma campanha, escolha os leads pelo filtro e confira as mensagens. Ao iniciar, os leads entram na fila automaticamente.
        </Empty>
      ) : list.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-sm">Nenhuma campanha nesta aba.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => {
            const pending = c.stats.pending + c.stats.sending;
            const total = pending + c.stats.sent + c.stats.failed + c.stats.skipped;
            const done = total - pending;
            const next = c.nextRunAt && new Date(c.nextRunAt).getTime() > Date.now() ? new Date(c.nextRunAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
            return (
              <Card key={c.id} className="flex flex-col p-5">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <Link href={`/campaigns/${c.id}`} className="text-lg leading-tight font-semibold hover:underline">
                    {c.name}
                  </Link>
                  <Badge color={CAMPAIGN_STATUS[c.status]?.color}>{CAMPAIGN_STATUS[c.status]?.label}</Badge>
                </div>
                <p className="text-muted-foreground mb-3 text-xs">
                  {c.startedAt ? `Iniciada ${timeAgo(c.startedAt)}` : `Criada ${timeAgo(c.createdAt)}`} · {c.templates.filter((t) => t.trim()).length} mensage
                  {c.templates.filter((t) => t.trim()).length === 1 ? "m" : "ns"}
                </p>
                <div className="bg-muted mb-1 h-1.5 overflow-hidden rounded-full">
                  <div className="bg-primary h-full rounded-full" style={{ width: total ? `${(done / total) * 100}%` : 0 }} />
                </div>
                <p className="text-muted-foreground mb-3 text-[11px] tabular-nums">
                  {done} de {total} processados
                </p>
                <div className="grid grid-cols-4 text-center">
                  {[
                    ["Enviadas", c.stats.sent],
                    ["Respostas", c.stats.replied],
                    ["Na fila", pending],
                    ["Falhas/ignor.", c.stats.failed + c.stats.skipped],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <p className="text-xl font-semibold tabular-nums">{v}</p>
                      <p className="text-muted-foreground text-[11px]">{k}</p>
                    </div>
                  ))}
                </div>
                <p className="text-muted-foreground mt-3 text-xs">
                  Hoje {c.sentToday}/{c.dailyLimit}
                  {c.agent ? ` · respostas com ${c.agent.name}` : " · sem IA nas respostas"}
                </p>
                {c.status === "RUNNING" && (
                  <p className="text-primary mt-1 text-xs">{c.waitReason ?? (next ? `Próximo envio por volta das ${next}` : "Enviando…")}</p>
                )}
                {c.status === "PAUSED" && c.lastError && (
                  <p className="text-destructive mt-1 line-clamp-2 text-xs" title={c.lastError}>
                    {c.lastError}
                  </p>
                )}
                <div className="mt-auto flex items-center gap-2 pt-4">
                  {c.status === "RUNNING" ? (
                    <Button size="sm" variant="outline" className="flex-1" disabled={busy} onClick={() => act(c, "pause")}>
                      <Pause className="size-3.5" />
                      Pausar
                    </Button>
                  ) : c.status === "PAUSED" ? (
                    <Button size="sm" className="flex-1" disabled={busy} onClick={() => act(c, "start")}>
                      <Play className="size-3.5" />
                      Retomar
                    </Button>
                  ) : (
                    <Button size="sm" variant={c.status === "DRAFT" ? "primary" : "outline"} className="flex-1" onClick={() => router.push(`/campaigns/${c.id}`)}>
                      {c.status === "DRAFT" ? "Configurar e iniciar" : "Ver resultados"}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setRecipientsCampaign(c)} aria-label="Ver destinatários">
                    <Users className="size-3.5" />
                    {pending}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton variant="ghost" size="icon-sm" aria-label="Mais ações">
                        <MoreHorizontal />
                      </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => act(c, "duplicate")}>
                        <Copy /> Duplicar
                      </DropdownMenuItem>
                      {c.status !== "RUNNING" && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => remove(c)}>
                            <Trash2 /> Excluir
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <CampaignRecipientsModal campaign={recipientsCampaign} onClose={() => setRecipientsCampaign(null)} />
    </>
  );
}

type Recipient = { id: string; status: string; lead: { id: string; name: string; phone: string | null; city: string | null } };
type RecipientsPage = { total: number; pending: number; sending: number; skip: number; pageSize: number; targets: Recipient[] };

function CampaignRecipientsModal({ campaign, onClose }: { campaign: Campaign | null; onClose: () => void }) {
  const [skip, setSkip] = useState(0);
  const url = campaign ? `/api/campaigns/${campaign.id}/recipients?skip=${skip}` : null;
  const { data, mutate, isLoading } = useApi<RecipientsPage>(url, { refreshInterval: 8000 });
  const { run, busy } = useAction();
  const end = Math.min(skip + (data?.targets.length ?? 0), data?.total ?? 0);

  useEffect(() => setSkip(0), [campaign?.id]);

  async function remove(target: Recipient) {
    const result = await run(
      () => api(`/api/campaigns/${campaign!.id}/recipients`, { method: "DELETE", body: { targetId: target.id } }),
      "Destinatário removido da campanha",
    );
    if (!result) return;
    if (data?.targets.length === 1 && skip > 0) setSkip(Math.max(0, skip - data.pageSize));
    await mutate();
  }

  return (
    <Modal open={!!campaign} onClose={onClose} title={`Quem vai receber${campaign ? ` · ${campaign.name}` : ""}`} wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p><strong>{data?.total ?? "…"}</strong> destinatários · {data?.pending ?? 0} pendentes · {data?.sending ?? 0} enviando</p>
        {data && data.total > data.pageSize && <p className="text-xs text-mute">Exibindo {skip + 1}–{end} de {data.total}</p>}
      </div>
      {isLoading && !data ? (
        <p className="py-8 text-center text-sm text-mute">Carregando destinatários…</p>
      ) : !data?.targets.length ? (
        <p className="py-8 text-center text-sm text-mute">Nenhum destinatário pendente ou enviando.</p>
      ) : (
        <ul className="max-h-[55vh] divide-y divide-line overflow-y-auto">
          {data.targets.map((target) => (
            <li key={target.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{target.lead.name}</p>
                <p className="text-xs text-mute">{formatPhone(target.lead.phone)}{target.lead.city ? ` · ${target.lead.city}` : ""}</p>
              </div>
              {target.status === "SENDING" ? (
                <Badge className="bg-cobalt/10 text-cobalt">Enviando</Badge>
              ) : (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => remove(target)} aria-label={`Remover ${target.lead.name} da campanha`}>
                  Remover
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-between border-t border-line pt-4">
        <Button size="sm" variant="outline" disabled={skip === 0 || busy} onClick={() => setSkip(Math.max(0, skip - (data?.pageSize ?? 100)))}>Anterior</Button>
        <Button size="sm" variant="outline" disabled={!data || skip + data.pageSize >= data.total || busy} onClick={() => setSkip(skip + (data?.pageSize ?? 100))}>Próxima</Button>
      </div>
    </Modal>
  );
}
