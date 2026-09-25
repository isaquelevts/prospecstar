"use client";

import Link from "next/link";
import { Badge, Card, PageHeader, timeAgo, useApi } from "@/components/ui";
import { WEBSITE_STATUS_LABEL } from "@/lib/website";

type Dash = {
  leads: number;
  withPhone: number;
  noSite: number;
  sentToday: number;
  inToday: number;
  sent7: number;
  replied7: number;
  replyRate: number;
  aiOn: number;
  running: { id: string; name: string }[];
  stages: { id: string; name: string; color: string; count: number }[];
  recent: { id: string; name: string; lastInboundAt: string; unread: number; stage?: { name: string; color: string } | null }[];
  byWebsiteStatus: { status: string; count: number }[];
};

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs text-mute">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums">{value}</p>
      {note && <p className="mt-0.5 text-xs text-mute">{note}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { data } = useApi<Dash>("/api/dashboard", { refreshInterval: 30_000 });
  if (!data) return <p className="text-sm text-mute">Carregando…</p>;
  const maxStage = Math.max(1, ...data.stages.map((s) => s.count));
  const hot = data.byWebsiteStatus.filter((b) => ["NONE", "SOCIAL_ONLY", "OFFLINE"].includes(b.status));

  return (
    <>
      <PageHeader
        title="Painel"
        sub={
          data.running.length
            ? `Disparando agora: ${data.running.map((r) => r.name).join(", ")}`
            : "Nenhuma campanha disparando no momento."
        }
      />

      <Card className="mb-6 grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x">
        <Stat label="Leads na base" value={data.leads.toLocaleString("pt-BR")} note={`${data.withPhone.toLocaleString("pt-BR")} com telefone`} />
        <Stat label="Sem site ou só rede social" value={data.noSite.toLocaleString("pt-BR")} note="seu público mais quente" />
        <Stat label="Mensagens hoje" value={`${data.sentToday} / ${data.inToday}`} note="enviadas / recebidas" />
        <Stat label="Taxa de resposta (7 dias)" value={`${data.replyRate}%`} note={`${data.replied7} de ${data.sent7} disparos`} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <h2 className="mb-4 font-display text-lg font-bold">Funil</h2>
          <div className="space-y-2.5">
            {data.stages.map((s) => (
              <Link key={s.id} href={`/leads?stageId=${s.id}`} className="group grid grid-cols-[130px_1fr_48px] items-center gap-3 text-sm">
                <span className="truncate group-hover:underline">{s.name}</span>
                <span className="h-6 overflow-hidden rounded-md bg-paper">
                  <span className="block h-full rounded-md" style={{ width: `${(s.count / maxStage) * 100}%`, background: s.color, minWidth: s.count ? 6 : 0 }} />
                </span>
                <span className="text-right font-mono text-xs tabular-nums">{s.count}</span>
              </Link>
            ))}
          </div>
          {hot.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4 text-xs text-mute">
              Leads quentes por situação do site:
              {hot.map((h) => (
                <Link key={h.status} href={`/leads?websiteStatus=${h.status}`}>
                  <Badge className="bg-heat-soft text-heat">
                    {WEBSITE_STATUS_LABEL[h.status]} · {h.count}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Últimas respostas</h2>
            <span className="text-xs text-mute">{data.aiOn} leads com IA ligada</span>
          </div>
          {data.recent.length === 0 ? (
            <p className="text-sm text-mute">Quando alguém responder no WhatsApp, aparece aqui.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/inbox?lead=${r.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:text-cobalt">
                    <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                    {r.stage && <Badge color={r.stage.color}>{r.stage.name}</Badge>}
                    {r.unread > 0 && <span className="h-2 w-2 rounded-full bg-heat" aria-label="não lida" />}
                    <span className="w-12 text-right text-xs text-mute">{timeAgo(r.lastInboundAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
