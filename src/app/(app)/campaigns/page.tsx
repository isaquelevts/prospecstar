"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Empty, PageHeader, api, useAction, useApi } from "@/components/ui";
import { CAMPAIGN_STATUS } from "@/components/labels";

type Campaign = {
  id: string;
  name: string;
  status: string;
  dailyLimit: number;
  agent: { name: string } | null;
  stats: { pending: number; sent: number; failed: number; skipped: number; replied: number };
};


export default function CampaignsPage() {
  const { data } = useApi<Campaign[]>("/api/campaigns", { refreshInterval: 10_000 });
  const router = useRouter();
  const { run, busy } = useAction();

  async function create() {
    const c = await run(() =>
      api<{ id: string }>("/api/campaigns", {
        body: {
          name: `Campanha ${new Date().toLocaleDateString("pt-BR")}`,
          templates: [
            "{{saudacao}}, tudo bem? Vi a {{nome}} no Google e {achei muito bem avaliada|gostei das avaliações de vocês}! Notei que vocês ainda não têm um site próprio. Posso te mostrar em 2 minutos como um site pode trazer mais clientes pra vocês?",
          ],
          filter: { websiteStatus: ["NONE", "SOCIAL_ONLY", "OFFLINE"], neverContacted: true },
        },
      }),
    );
    if (c) router.push(`/campaigns/${c.id}`);
  }

  return (
    <>
      <PageHeader
        title="Disparos"
        sub="Campanhas enviam uma mensagem por vez, com intervalos aleatórios e limite diário, para proteger seu número."
        actions={
          <Button onClick={create} disabled={busy}>
            Nova campanha
          </Button>
        }
      />
      {data?.length === 0 ? (
        <Empty title="Nenhuma campanha ainda">Crie uma campanha, escolha os leads pelo filtro e escreva variações da mensagem.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.map((c) => {
            const total = c.stats.pending + c.stats.sent + c.stats.failed + c.stats.skipped;
            const done = total - c.stats.pending;
            return (
              <Link key={c.id} href={`/campaigns/${c.id}`}>
                <Card className="p-5 transition-colors hover:border-ink/25">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <h3 className="font-display text-lg leading-tight font-bold">{c.name}</h3>
                    <Badge color={CAMPAIGN_STATUS[c.status]?.color}>{CAMPAIGN_STATUS[c.status]?.label}</Badge>
                  </div>
                  <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-cobalt" style={{ width: total ? `${(done / total) * 100}%` : 0 }} />
                  </div>
                  <div className="grid grid-cols-4 text-center">
                    {[
                      ["Enviadas", c.stats.sent],
                      ["Respostas", c.stats.replied],
                      ["Na fila", c.stats.pending],
                      ["Falhas", c.stats.failed + c.stats.skipped],
                    ].map(([k, v]) => (
                      <div key={k as string}>
                        <p className="font-display text-xl font-bold tabular-nums">{v}</p>
                        <p className="text-[11px] text-mute">{k}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-mute">
                    {c.dailyLimit}/dia{c.agent ? ` · respostas com ${c.agent.name}` : " · sem IA nas respostas"}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
