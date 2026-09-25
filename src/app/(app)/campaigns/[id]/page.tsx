"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Textarea, Toggle, api, formatPhone, timeAgo, useAction, useApi } from "@/components/ui";
import { CAMPAIGN_STATUS } from "@/components/labels";
import { WEBSITE_STATUS_LABEL } from "@/lib/website";
import { TEMPLATE_VARIABLES } from "@/lib/template";

type Filter = { stageId?: string; tag?: string; websiteStatus?: string[]; city?: string; category?: string; minScore?: number; neverContacted?: boolean; scrapeJobId?: string };
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
};
type Target = { id: string; status: string; sentAt: string | null; repliedAt: string | null; error: string | null; message: string | null; lead: { id: string; name: string; phone: string | null; city: string | null } };

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TARGET_STATUS: Record<string, string> = { PENDING: "Na fila", SENT: "Enviada", FAILED: "Falhou", SKIPPED: "Ignorada" };

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [tab, setTab] = useState("");
  const { data, mutate } = useApi<{ campaign: Campaign; targets: Target[] }>(`/api/campaigns/${id}?status=${tab}`, { refreshInterval: 8000 });
  const { data: stages } = useApi<Array<{ id: string; name: string }>>("/api/stages");
  const { data: agents } = useApi<Array<{ id: string; name: string }>>("/api/agents");
  const { data: all } = useApi<Array<{ id: string; stats: Record<string, number> }>>("/api/campaigns", { refreshInterval: 8000 });
  const [c, setC] = useState<Campaign | null>(null);
  const [preview, setPreview] = useState<{ count: number; examples: { lead: string; text: string }[] } | null>(null);
  const { run, busy } = useAction();

  useEffect(() => {
    if (data && !c) setC(data.campaign);
  }, [data, c]);

  // prévia ao vivo (com debounce) do público e das mensagens
  useEffect(() => {
    if (!c) return;
    const t = setTimeout(() => {
      api("/api/campaigns/preview", { body: { templates: c.templates, filter: c.filter } })
        .then(setPreview)
        .catch(() => null);
    }, 500);
    return () => clearTimeout(t);
  }, [c?.templates, c?.filter]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!c || !data) return <p className="text-sm text-mute">Carregando…</p>;
  const stats = all?.find((x) => x.id === id)?.stats ?? {};
  const status = data.campaign.status;
  const running = status === "RUNNING";
  const set = (p: Partial<Campaign>) => setC({ ...c, ...p });
  const setFilter = (p: Partial<Filter>) => set({ filter: { ...c.filter, ...p } });

  const save = () =>
    run(async () => {
      const { id: _id, status: _s, ...body } = c;
      await api(`/api/campaigns/${id}`, { method: "PATCH", body });
      mutate();
    }, "Campanha salva");

  const action = async (a: string, msg: (r: any) => string) => {
    if (a === "start") await save();
    await run(() => api(`/api/campaigns/${id}`, { body: { action: a } }), msg);
    mutate();
  };

  return (
    <>
      <Link href="/campaigns" className="text-xs text-mute hover:text-ink">
        ← Disparos
      </Link>
      <PageHeader
        title={c.name}
        sub={
          <span className="inline-flex items-center gap-2">
            <Badge color={CAMPAIGN_STATUS[status]?.color}>{CAMPAIGN_STATUS[status]?.label}</Badge>
            {stats.sent ?? 0} enviadas · {stats.pending ?? 0} na fila · {stats.replied ?? 0} respostas
          </span>
        }
        actions={
          <>
            <Button variant="outline" disabled={busy} onClick={save}>
              Salvar
            </Button>
            {running ? (
              <Button variant="danger" disabled={busy} onClick={() => action("pause", () => "Campanha pausada")}>
                Pausar
              </Button>
            ) : (
              <Button disabled={busy || status === "DONE"} onClick={() => action("start", () => "Disparos iniciados")}>
                {status === "PAUSED" ? "Retomar" : "Iniciar disparos"}
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <Field label="Nome da campanha">
              <Input value={c.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] font-medium">Mensagens</span>
                <span className="text-xs text-mute">Uma variação é sorteada para cada lead</span>
              </div>
              <div className="space-y-3">
                {c.templates.map((t, i) => (
                  <div key={i} className="relative">
                    <Textarea
                      rows={4}
                      value={t}
                      onChange={(e) => set({ templates: c.templates.map((x, j) => (j === i ? e.target.value : x)) })}
                      placeholder="{{saudacao}}, tudo bem? ..."
                    />
                    {c.templates.length > 1 && (
                      <button
                        className="absolute top-2 right-2 rounded px-1.5 text-xs text-mute hover:bg-bad-soft hover:text-bad"
                        onClick={() => set({ templates: c.templates.filter((_, j) => j !== i) })}
                        aria-label="Remover variação"
                      >
                        remover
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <Button size="sm" variant="outline" onClick={() => set({ templates: [...c.templates, ""] })}>
                  + Variação
                </Button>
                <span className="ml-2 text-xs text-mute">Variáveis:</span>
                {TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v}
                    onClick={() => set({ templates: c.templates.map((x, j) => (j === c.templates.length - 1 ? `${x}{{${v}}}` : x)) })}
                    className="rounded bg-paper px-1.5 py-0.5 font-mono text-[11px] text-cobalt hover:bg-cobalt-soft"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-mute">
                Use <code className="font-mono">{"{Oi|Olá|E aí}"}</code> para sortear palavras — cada lead recebe um texto um pouco diferente, o que reduz o risco de bloqueio.
              </p>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 font-display font-bold">Quem vai receber</h2>
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
              <Field label="Temperatura mínima">
                <Input type="number" min={0} max={100} value={c.filter.minScore ?? ""} onChange={(e) => setFilter({ minScore: e.target.value ? Number(e.target.value) : undefined })} />
              </Field>
              <Field label="Cidade contém">
                <Input value={c.filter.city ?? ""} onChange={(e) => setFilter({ city: e.target.value || undefined })} />
              </Field>
              <Field label="Segmento contém">
                <Input value={c.filter.category ?? ""} onChange={(e) => setFilter({ category: e.target.value || undefined })} />
              </Field>
              <div className="flex items-end pb-2">
                <Toggle checked={!!c.filter.neverContacted} onChange={(v) => setFilter({ neverContacted: v || undefined })} label="Só nunca contatados" />
              </div>
            </div>
            <div className="mt-4">
              <span className="mb-1.5 block text-[13px] font-medium">Situação do site</span>
              <div className="flex flex-wrap gap-2">
                {Object.entries(WEBSITE_STATUS_LABEL).map(([k, label]) => {
                  const on = c.filter.websiteStatus?.includes(k);
                  return (
                    <button
                      key={k}
                      onClick={() => {
                        const cur = new Set(c.filter.websiteStatus ?? []);
                        if (on) cur.delete(k);
                        else cur.add(k);
                        setFilter({ websiteStatus: cur.size ? [...cur] : undefined });
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-xs ${on ? "border-cobalt bg-cobalt-soft text-cobalt" : "border-line text-mute hover:border-ink/30"}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg bg-paper px-4 py-3 text-sm">
              <span>
                <strong className="font-display text-lg">{preview?.count ?? "…"}</strong> leads com WhatsApp batem com o filtro
              </span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                disabled={busy}
                onClick={async () => {
                  await save();
                  await action("populate", (r) => `${r.added} leads adicionados à fila`);
                }}
              >
                Adicionar à fila da campanha
              </Button>
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center gap-1 border-b border-line px-4 py-3">
              {["", "PENDING", "SENT", "FAILED", "SKIPPED"].map((s) => (
                <button key={s} onClick={() => setTab(s)} className={`rounded-md px-2.5 py-1 text-xs ${tab === s ? "bg-ink text-white" : "text-mute hover:bg-ink/5"}`}>
                  {s ? TARGET_STATUS[s] : "Todos"}
                </button>
              ))}
              {(stats.failed ?? 0) > 0 && (
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => action("reset_failed", (r) => `${r.reset} falhas voltaram para a fila`)}>
                  Tentar falhas de novo
                </Button>
              )}
            </div>
            {data.targets.length === 0 ? (
              <p className="p-6 text-center text-sm text-mute">Nenhum lead na fila. Ajuste o filtro e clique em “Adicionar à fila da campanha”.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {data.targets.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <Link href={`/leads/${t.lead.id}`} className="min-w-0 flex-1 truncate hover:text-cobalt">
                      {t.lead.name}
                      <span className="ml-2 font-mono text-xs text-mute">{formatPhone(t.lead.phone)}</span>
                    </Link>
                    {t.error && <span className="max-w-xs truncate text-xs text-bad" title={t.error}>{t.error}</span>}
                    {t.repliedAt && <Badge className="bg-ok-soft text-ok">respondeu</Badge>}
                    <span className="text-xs text-mute">{t.sentAt ? timeAgo(t.sentAt) : ""}</span>
                    <Badge>{TARGET_STATUS[t.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <h2 className="font-display font-bold">Ritmo de envio</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Intervalo mínimo (s)">
                <Input type="number" min={10} value={c.minDelaySec} onChange={(e) => set({ minDelaySec: Number(e.target.value) })} />
              </Field>
              <Field label="Intervalo máximo (s)">
                <Input type="number" min={10} value={c.maxDelaySec} onChange={(e) => set({ maxDelaySec: Number(e.target.value) })} />
              </Field>
              <Field label="Início">
                <Input type="time" value={c.windowStart} onChange={(e) => set({ windowStart: e.target.value })} />
              </Field>
              <Field label="Fim">
                <Input type="time" value={c.windowEnd} onChange={(e) => set({ windowEnd: e.target.value })} />
              </Field>
            </div>
            <Field label="Limite por dia" hint="Números novos: comece com 20–40/dia e aumente aos poucos.">
              <Input type="number" min={1} value={c.dailyLimit} onChange={(e) => set({ dailyLimit: Number(e.target.value) })} />
            </Field>
            <div className="flex flex-wrap gap-1">
              {DAYS.map((d, i) => {
                const on = c.weekdays.includes(i);
                return (
                  <button
                    key={d}
                    onClick={() => set({ weekdays: on ? c.weekdays.filter((x) => x !== i) : [...c.weekdays, i].sort() })}
                    className={`h-8 w-11 rounded-md text-xs ${on ? "bg-ink text-white" : "border border-line text-mute"}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="font-display font-bold">Quando responderem</h2>
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
            <h2 className="mb-3 font-display font-bold">Prévia</h2>
            {preview?.examples.length ? (
              <div className="space-y-3">
                {preview.examples.map((e, i) => (
                  <div key={i}>
                    <p className="mb-1 text-xs text-mute">para {e.lead}</p>
                    <p className="rounded-2xl rounded-br-sm bg-ink px-3.5 py-2 text-sm whitespace-pre-wrap text-white">{e.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-mute">Escreva a mensagem e ajuste o filtro para ver exemplos.</p>
            )}
          </Card>

          <Button
            variant="ghost"
            className="w-full text-bad"
            onClick={async () => {
              if (!confirm("Excluir esta campanha? O histórico de mensagens dos leads é mantido.")) return;
              await run(() => api(`/api/campaigns/${id}`, { method: "DELETE" }), "Campanha excluída");
              router.push("/campaigns");
            }}
          >
            Excluir campanha
          </Button>
        </div>
      </div>
    </>
  );
}
