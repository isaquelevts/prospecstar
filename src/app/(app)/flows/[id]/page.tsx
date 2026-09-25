"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Textarea, Toggle, api, timeAgo, useAction, useApi } from "@/components/ui";
import { STEP_LABELS, TRIGGERS, defaultStep, type FlowStep, type TriggerConfig, type TriggerType } from "@/lib/flow-types";
import { WEBSITE_STATUS_LABEL } from "@/lib/website";

type Flow = { id: string; name: string; active: boolean; trigger: TriggerType; triggerConfig: TriggerConfig; steps: FlowStep[]; stopOnReply: boolean };
type Run = { id: string; status: string; stepIndex: number; updatedAt: string; nextRunAt: string | null; log: { at: string; msg: string }[]; lead: { id: string; name: string } };
type Opt = { id: string; name: string };

const RUN_STATUS: Record<string, string> = { RUNNING: "Executando", WAITING: "Aguardando", DONE: "Concluída", STOPPED: "Parada", FAILED: "Falhou" };

function StepEditor({ step, onChange, stages, agents }: { step: FlowStep; onChange: (s: FlowStep) => void; stages?: Opt[]; agents?: Opt[] }) {
  switch (step.type) {
    case "send_message":
      return (
        <div className="space-y-2">
          {step.texts.map((t, i) => (
            <Textarea key={i} rows={3} value={t} onChange={(e) => onChange({ ...step, texts: step.texts.map((x, j) => (j === i ? e.target.value : x)) })} />
          ))}
          <button className="text-xs text-cobalt hover:underline" onClick={() => onChange({ ...step, texts: [...step.texts, ""] })}>
            + variação
          </button>
        </div>
      );
    case "ai_message":
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <Textarea rows={3} value={step.instruction} onChange={(e) => onChange({ ...step, instruction: e.target.value })} placeholder="O que a IA deve escrever" />
          <Select value={step.agentId ?? ""} onChange={(e) => onChange({ ...step, agentId: e.target.value || undefined })}>
            <option value="">Agente do lead</option>
            {agents?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
      );
    case "wait":
      return (
        <div className="flex gap-2">
          <Input type="number" min={1} value={step.amount} onChange={(e) => onChange({ ...step, amount: Number(e.target.value) })} className="w-24" />
          <Select value={step.unit} onChange={(e) => onChange({ ...step, unit: e.target.value as "minutes" })} className="w-40">
            <option value="minutes">minutos</option>
            <option value="hours">horas</option>
            <option value="days">dias</option>
          </Select>
        </div>
      );
    case "condition":
      return (
        <div className="grid gap-2 sm:grid-cols-4">
          <Select value={step.field} onChange={(e) => onChange({ ...step, field: e.target.value as "tag" })}>
            <option value="websiteStatus">Situação do site</option>
            <option value="tag">Tem a tag</option>
            <option value="stageId">Etapa</option>
            <option value="score">Temperatura</option>
            <option value="city">Cidade</option>
            <option value="category">Segmento</option>
          </Select>
          <Select value={step.op} onChange={(e) => onChange({ ...step, op: e.target.value as "eq" })}>
            <option value="eq">é igual a</option>
            <option value="neq">é diferente de</option>
            <option value="contains">contém</option>
            <option value="gte">maior ou igual</option>
            <option value="lte">menor ou igual</option>
          </Select>
          {step.field === "websiteStatus" ? (
            <Select value={step.value} onChange={(e) => onChange({ ...step, value: e.target.value })}>
              {Object.entries(WEBSITE_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          ) : step.field === "stageId" ? (
            <Select value={step.value} onChange={(e) => onChange({ ...step, value: e.target.value })}>
              <option value="">—</option>
              {stages?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          ) : (
            <Input value={step.value} onChange={(e) => onChange({ ...step, value: e.target.value })} />
          )}
          <Select value={step.onFail} onChange={(e) => onChange({ ...step, onFail: e.target.value as "stop" })}>
            <option value="stop">se falso: parar</option>
            <option value="skip_next">se falso: pular próximo</option>
          </Select>
        </div>
      );
    case "move_stage":
      return (
        <Select value={step.stageId} onChange={(e) => onChange({ ...step, stageId: e.target.value })}>
          <option value="">Escolha a etapa</option>
          {stages?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      );
    case "add_tag":
    case "remove_tag":
      return <Input value={step.tag} onChange={(e) => onChange({ ...step, tag: e.target.value })} placeholder="nome-da-tag" />;
    case "set_ai":
      return (
        <div className="flex flex-wrap items-center gap-4">
          <Toggle checked={step.enabled} onChange={(v) => onChange({ ...step, enabled: v })} label={step.enabled ? "Ligar IA" : "Desligar IA"} />
          {step.enabled && (
            <Select value={step.agentId ?? ""} onChange={(e) => onChange({ ...step, agentId: e.target.value || undefined })} className="w-56">
              <option value="">Manter agente atual</option>
              {agents?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      );
    case "webhook":
      return <Input value={step.url} onChange={(e) => onChange({ ...step, url: e.target.value })} placeholder="https://seu-n8n/webhook/…" />;
    default:
      return <p className="text-xs text-mute">Sem configuração.</p>;
  }
}

export default function FlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, mutate } = useApi<{ flow: Flow; runs: Run[] }>(`/api/flows/${id}`, { refreshInterval: 10_000 });
  const { data: stages } = useApi<Opt[]>("/api/stages");
  const { data: agents } = useApi<Opt[]>("/api/agents");
  const [f, setF] = useState<Flow | null>(null);
  const [adding, setAdding] = useState("");
  const { run, busy } = useAction();

  useEffect(() => {
    if (data && !f) setF(data.flow);
  }, [data, f]);
  if (!f || !data) return <p className="text-sm text-mute">Carregando…</p>;
  const set = (p: Partial<Flow>) => setF({ ...f, ...p });
  const setStep = (i: number, s: FlowStep) => set({ steps: f.steps.map((x, j) => (j === i ? s : x)) });
  const move = (i: number, d: number) => {
    const s = [...f.steps];
    const [x] = s.splice(i, 1);
    s.splice(i + d, 0, x);
    set({ steps: s });
  };
  const save = () =>
    run(async () => {
      const { id: _id, ...body } = f;
      await api(`/api/flows/${id}`, { method: "PATCH", body });
      mutate();
    }, "Automação salva");

  return (
    <>
      <Link href="/flows" className="text-xs text-mute hover:text-ink">
        ← Automações
      </Link>
      <PageHeader
        title={f.name}
        actions={
          <>
            <Toggle checked={f.active} onChange={(v) => set({ active: v })} label={f.active ? "Ativa" : "Inativa"} />
            <Button disabled={busy} onClick={save}>
              Salvar
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div>
          <Card className="mb-4 space-y-4 p-5">
            <Field label="Nome">
              <Input value={f.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Quando começar">
                <Select value={f.trigger} onChange={(e) => set({ trigger: e.target.value as TriggerType, triggerConfig: {} })}>
                  {Object.entries(TRIGGERS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              {f.trigger === "MESSAGE_RECEIVED" && (
                <Field label="Palavras-chave (opcional)" hint="Separadas por vírgula. Vazio = qualquer mensagem.">
                  <Input value={f.triggerConfig.keyword ?? ""} onChange={(e) => set({ triggerConfig: { keyword: e.target.value } })} placeholder="preço, orçamento, valor" />
                </Field>
              )}
              {f.trigger === "STAGE_CHANGED" && (
                <Field label="Etapa">
                  <Select value={f.triggerConfig.stageId ?? ""} onChange={(e) => set({ triggerConfig: { stageId: e.target.value } })}>
                    <option value="">Qualquer etapa</option>
                    {stages?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {f.trigger === "TAG_ADDED" && (
                <Field label="Tag">
                  <Input value={f.triggerConfig.tag ?? ""} onChange={(e) => set({ triggerConfig: { tag: e.target.value } })} />
                </Field>
              )}
              {f.trigger === "NO_REPLY" && (
                <Field label="Horas sem resposta" hint="Conta a partir da última mensagem enviada ao lead.">
                  <Input type="number" min={1} value={f.triggerConfig.hours ?? 24} onChange={(e) => set({ triggerConfig: { hours: Number(e.target.value) } })} />
                </Field>
              )}
            </div>
            <Toggle checked={f.stopOnReply} onChange={(v) => set({ stopOnReply: v })} label="Não enviar mais mensagens deste fluxo se o lead responder" />
          </Card>

          <ol className="space-y-3">
            {f.steps.map((s, i) => (
              <li key={i}>
                <Card className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-ink font-mono text-[11px] text-white">{i + 1}</span>
                    <span className="text-sm font-medium">{STEP_LABELS[s.type]}</span>
                    <div className="ml-auto flex gap-1 text-xs">
                      <button disabled={i === 0} onClick={() => move(i, -1)} className="rounded px-1.5 py-0.5 text-mute hover:bg-ink/5 disabled:opacity-30" aria-label="Subir">
                        ↑
                      </button>
                      <button disabled={i === f.steps.length - 1} onClick={() => move(i, 1)} className="rounded px-1.5 py-0.5 text-mute hover:bg-ink/5 disabled:opacity-30" aria-label="Descer">
                        ↓
                      </button>
                      <button onClick={() => set({ steps: f.steps.filter((_, j) => j !== i) })} className="rounded px-1.5 py-0.5 text-mute hover:bg-bad-soft hover:text-bad">
                        remover
                      </button>
                    </div>
                  </div>
                  <StepEditor step={s} onChange={(n) => setStep(i, n)} stages={stages} agents={agents} />
                </Card>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex gap-2">
            <Select value={adding} onChange={(e) => setAdding(e.target.value)} className="w-72">
              <option value="">Escolha um passo…</option>
              {Object.entries(STEP_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              disabled={!adding}
              onClick={() => {
                set({ steps: [...f.steps, defaultStep(adding as FlowStep["type"])] });
                setAdding("");
              }}
            >
              Adicionar passo
            </Button>
          </div>
          <p className="mt-3 text-xs text-mute">
            Nas mensagens valem as variáveis <code className="font-mono">{"{{nome}}"}</code>, <code className="font-mono">{"{{saudacao}}"}</code>, <code className="font-mono">{"{{cidade}}"}</code> e o sorteio{" "}
            <code className="font-mono">{"{a|b}"}</code>.
          </p>
        </div>

        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-display font-bold">Execuções</h2>
              <Button size="sm" variant="ghost" onClick={() => run(() => api(`/api/flows/${id}`, { body: {} }), (r: any) => `${r.stopped} execuções paradas`).then(() => mutate())}>
                Parar todas
              </Button>
            </div>
            {data.runs.length === 0 ? (
              <p className="p-5 text-sm text-mute">Nenhuma execução ainda.</p>
            ) : (
              <ul className="scroll-thin max-h-[60vh] divide-y divide-line overflow-y-auto text-sm">
                {data.runs.map((r) => (
                  <li key={r.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Link href={`/leads/${r.lead.id}`} className="min-w-0 flex-1 truncate hover:text-cobalt">
                        {r.lead.name}
                      </Link>
                      <Badge>{RUN_STATUS[r.status] ?? r.status}</Badge>
                    </div>
                    <p className="truncate text-xs text-mute" title={r.log.map((l) => l.msg).join("\n")}>
                      {r.status === "WAITING" && r.nextRunAt ? `próximo passo ${new Date(r.nextRunAt).toLocaleString("pt-BR")}` : (r.log.at(-1)?.msg ?? "")} · {timeAgo(r.updatedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Button
            variant="ghost"
            className="w-full text-bad"
            onClick={async () => {
              if (!confirm("Excluir esta automação?")) return;
              await run(() => api(`/api/flows/${id}`, { method: "DELETE" }), "Automação excluída");
              router.push("/flows");
            }}
          >
            Excluir automação
          </Button>
        </div>
      </div>
    </>
  );
}
