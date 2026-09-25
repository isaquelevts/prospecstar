"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatPanel } from "@/components/chat";
import { Badge, Button, Card, Field, Heat, Input, Select, SiteBadge, Textarea, api, formatPhone, timeAgo, useAction, useApi } from "@/components/ui";

type LeadDetail = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  websiteStatus: string | null;
  websiteInfo: Record<string, unknown> | null;
  address: string | null;
  city: string | null;
  state: string | null;
  category: string | null;
  rating: number | null;
  reviewsCount: number | null;
  mapsUrl: string | null;
  source: string;
  score: number;
  tags: string[];
  notes: string | null;
  customData: Record<string, string>;
  stageId: string | null;
  aiEnabled: boolean;
  agentId: string | null;
  optOut: boolean;
  waExists: boolean | null;
  createdAt: string;
  activities: { id: string; type: string; content: string; createdAt: string }[];
  flowRuns: { id: string; status: string; stepIndex: number; flow: { name: string }; createdAt: string }[];
  campaignTargets: { id: string; status: string; sentAt: string | null; campaign: { name: string } }[];
};

export default function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: lead, mutate } = useApi<LeadDetail>(`/api/leads/${id}`, { refreshInterval: 15_000 });
  const { data: stages } = useApi<Array<{ id: string; name: string }>>("/api/stages");
  const { data: agents } = useApi<Array<{ id: string; name: string }>>("/api/agents");
  const { data: flows } = useApi<Array<{ id: string; name: string }>>("/api/flows");
  const { run, busy } = useAction();
  const [edit, setEdit] = useState<Partial<LeadDetail>>({});
  const [note, setNote] = useState("");

  useEffect(() => setEdit({}), [id]);
  if (!lead) return <p className="text-sm text-mute">Carregando…</p>;
  const v = { ...lead, ...edit };
  const dirty = Object.keys(edit).length > 0;

  const patch = async (data: Record<string, unknown>, msg = "Salvo") => {
    await run(() => api(`/api/leads/${id}`, { method: "PATCH", body: data }), msg);
    mutate();
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/leads" className="text-xs text-mute hover:text-ink">
            ← Leads
          </Link>
          <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">{lead.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <Heat score={lead.score} />
            <SiteBadge status={lead.websiteStatus} />
            {lead.rating != null && (
              <span className="text-mute">
                ★ {lead.rating} <span className="text-xs">({lead.reviewsCount} avaliações)</span>
              </span>
            )}
            {lead.optOut && <Badge className="bg-bad-soft text-bad">Pediu para não receber mensagens</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={lead.stageId ?? ""} onChange={(e) => patch({ stageId: e.target.value }, "Etapa alterada")} className="w-48" aria-label="Etapa">
            {stages?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select
            value=""
            onChange={async (e) => {
              if (!e.target.value) return;
              await run(() => api("/api/leads/bulk", { body: { ids: [id], action: "flow", value: e.target.value } }), "Automação iniciada");
              mutate();
            }}
            className="w-48"
            aria-label="Iniciar automação"
          >
            <option value="">Iniciar automação…</option>
            {flows?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_460px]">
        <div className="space-y-6">
          <Card className="p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome">
                <Input value={v.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </Field>
              <Field label="WhatsApp" hint={lead.waExists === false ? "Este número não tem WhatsApp." : lead.phone ? formatPhone(lead.phone) : undefined}>
                <Input value={v.phone ?? ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} className="font-mono" />
              </Field>
              <Field label="Site / rede social">
                <Input value={v.website ?? ""} onChange={(e) => setEdit({ ...edit, website: e.target.value })} />
              </Field>
              <Field label="E-mail">
                <Input value={v.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              </Field>
              <Field label="Cidade">
                <Input value={v.city ?? ""} onChange={(e) => setEdit({ ...edit, city: e.target.value })} />
              </Field>
              <Field label="Segmento">
                <Input value={v.category ?? ""} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
              </Field>
              <Field label="Tags" hint="Separadas por vírgula">
                <Input
                  value={Array.isArray(v.tags) ? v.tags.join(", ") : ""}
                  onChange={(e) => setEdit({ ...edit, tags: e.target.value.split(",").map((t) => t.trimStart()) })}
                />
              </Field>
              <Field label="Agente de IA deste lead">
                <Select value={v.agentId ?? ""} onChange={(e) => patch({ agentId: e.target.value || null }, "Agente alterado")}>
                  <option value="">Agente padrão</option>
                  {agents?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Observações">
                  <Textarea rows={3} value={v.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
                </Field>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                disabled={!dirty || busy}
                onClick={async () => {
                  const data = { ...edit, ...(edit.tags ? { tags: edit.tags.map((t) => t.trim()).filter(Boolean) } : {}) };
                  await patch(data);
                  setEdit({});
                }}
              >
                Salvar alterações
              </Button>
              {lead.optOut ? (
                <Button variant="outline" onClick={() => patch({ optOut: false }, "Lead pode receber mensagens novamente")}>
                  Remover opt-out
                </Button>
              ) : (
                <Button variant="outline" onClick={() => patch({ optOut: true, aiEnabled: false }, "Lead marcado como opt-out")}>
                  Marcar opt-out
                </Button>
              )}
              <Button
                variant="ghost"
                className="ml-auto text-bad"
                onClick={async () => {
                  if (!confirm("Excluir este lead e todo o histórico?")) return;
                  await run(() => api(`/api/leads/${id}`, { method: "DELETE" }), "Lead excluído");
                  router.push("/leads");
                }}
              >
                Excluir lead
              </Button>
            </div>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-3 font-display font-bold">Dados coletados</h2>
              <dl className="space-y-1.5 text-sm">
                {lead.address && <Row k="Endereço" v={lead.address} />}
                {lead.mapsUrl && <Row k="Google Maps" v={<a className="text-cobalt underline" href={lead.mapsUrl} target="_blank" rel="noreferrer">abrir</a>} />}
                <Row k="Origem" v={lead.source} />
                <Row k="Criado" v={new Date(lead.createdAt).toLocaleString("pt-BR")} />
                {lead.websiteInfo &&
                  Object.entries(lead.websiteInfo)
                    .filter(([, x]) => x != null && x !== "")
                    .map(([k, x]) => <Row key={k} k={`site.${k}`} v={String(x)} />)}
                {Object.entries(lead.customData ?? {}).map(([k, x]) => (
                  <Row key={k} k={k} v={String(x)} />
                ))}
              </dl>
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 font-display font-bold">Campanhas e automações</h2>
              <ul className="space-y-1.5 text-sm">
                {lead.campaignTargets.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span className="truncate">{c.campaign.name}</span>
                    <Badge>{c.status}</Badge>
                  </li>
                ))}
                {lead.flowRuns.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span className="truncate">⟳ {r.flow.name}</span>
                    <Badge>{r.status}</Badge>
                  </li>
                ))}
                {!lead.campaignTargets.length && !lead.flowRuns.length && <li className="text-mute">Nenhuma ainda.</li>}
              </ul>
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="mb-3 font-display font-bold">Histórico</h2>
            <form
              className="mb-4 flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!note.trim()) return;
                await run(() => api(`/api/leads/${id}/messages`, { body: { note } }), "Nota adicionada");
                setNote("");
                mutate();
              }}
            >
              <Input placeholder="Adicionar nota (ex: ligou, pediu proposta até sexta)" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button variant="outline">Anotar</Button>
            </form>
            <ol className="space-y-2 border-l border-line pl-4 text-sm">
              {lead.activities.map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute top-1.5 -left-[21px] h-2 w-2 rounded-full bg-line" />
                  <span className="mr-2 text-xs text-mute">{timeAgo(a.createdAt)}</span>
                  {a.type === "note" ? <strong className="font-medium">{a.content}</strong> : a.content}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <Card className="h-[calc(100vh-10rem)] overflow-hidden xl:sticky xl:top-6">
          <ChatPanel leadId={id} aiEnabled={lead.aiEnabled} onChange={() => mutate()} />
        </Card>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-mute">{k}</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </div>
  );
}
