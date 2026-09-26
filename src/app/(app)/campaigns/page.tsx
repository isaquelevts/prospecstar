"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Empty, Modal, PageHeader, api, formatPhone, useAction, useApi } from "@/components/ui";
import { CAMPAIGN_STATUS } from "@/components/labels";

type Campaign = {
  id: string;
  name: string;
  status: string;
  dailyLimit: number;
  agent: { name: string } | null;
  stats: { pending: number; sending: number; sent: number; failed: number; skipped: number; replied: number };
};


export default function CampaignsPage() {
  const { data } = useApi<Campaign[]>("/api/campaigns", { refreshInterval: 10_000 });
  const router = useRouter();
  const { run, busy } = useAction();
  const [recipientsCampaign, setRecipientsCampaign] = useState<Campaign | null>(null);

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
            const pending = c.stats.pending + c.stats.sending;
            const total = pending + c.stats.sent + c.stats.failed + c.stats.skipped;
            const done = total - pending;
            return (
              <Card key={c.id} className="p-5 transition-colors hover:border-ink/25">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <Link href={`/campaigns/${c.id}`} className="font-display text-lg leading-tight font-bold hover:text-cobalt">{c.name}</Link>
                    <Badge color={CAMPAIGN_STATUS[c.status]?.color}>{CAMPAIGN_STATUS[c.status]?.label}</Badge>
                  </div>
                  <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-cobalt" style={{ width: total ? `${(done / total) * 100}%` : 0 }} />
                  </div>
                  <div className="grid grid-cols-4 text-center">
                    {[
                      ["Enviadas", c.stats.sent],
                      ["Respostas", c.stats.replied],
                      ["Vão receber", pending],
                      ["Falhas e ignorados", c.stats.failed + c.stats.skipped],
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
                  <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => setRecipientsCampaign(c)}>
                    Ver destinatários ({pending})
                  </Button>
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
