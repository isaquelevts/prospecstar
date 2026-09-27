"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Empty, PageHeader, Toggle, api, useAction, useApi } from "@/components/ui";
import { TRIGGERS, type FlowStep, type TriggerType } from "@/lib/flow-types";

type Flow = { id: string; name: string; active: boolean; trigger: TriggerType; steps: FlowStep[]; stats: Record<string, number> };

export default function FlowsPage() {
  const { data, mutate } = useApi<Flow[]>("/api/flows");
  const router = useRouter();
  const { run, busy } = useAction();

  return (
    <>
      <PageHeader
        title="Automações"
        sub="Sequências que rodam sozinhas a partir de um gatilho: follow-ups, mudança de etapa, ligar a IA, avisar você."
        actions={
          <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              const f = await run(() => api<{ id: string }>("/api/flows", {
                body: {
                  name: "Follow-up de WhatsApp",
                  trigger: "NO_REPLY",
                  triggerConfig: { hours: 24 },
                  stopOnReply: true,
                  steps: [
                    { type: "send_message", texts: ["{{saudacao}}, passando para saber se você conseguiu ver minha mensagem anterior." ] },
                    { type: "wait", amount: 2, unit: "days" },
                    { type: "send_message", texts: ["{{saudacao}}, posso ajudar com alguma dúvida? Se não for o momento, sem problemas."] },
                  ],
                },
              }));
              if (f) router.push(`/flows/${f.id}`);
            }}
          >
            Criar follow-up
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              const f = await run(() =>
                api<{ id: string }>("/api/flows", {
                  body: { name: "Nova automação", trigger: "NO_REPLY", triggerConfig: { hours: 48 }, steps: [] },
                }),
              );
              if (f) router.push(`/flows/${f.id}`);
            }}
          >
            Nova automação
          </Button>
          </div>
        }
      />
      {data?.length === 0 ? (
        <Empty title="Nenhuma automação">Comece com um follow-up: “se o lead não responder em 48h, mandar uma segunda mensagem”.</Empty>
      ) : (
        <Card className="divide-y divide-line">
          {data?.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <Toggle
                checked={f.active}
                onChange={async (v) => {
                  await run(() => api(`/api/flows/${f.id}`, { method: "PATCH", body: { active: v } }), v ? "Automação ativada" : "Automação desativada");
                  mutate();
                }}
              />
              <Link href={`/flows/${f.id}`} className="min-w-0 flex-1">
                <p className="font-display font-bold hover:text-cobalt">{f.name}</p>
                <p className="truncate text-xs text-mute">
                  Quando: {TRIGGERS[f.trigger]} · {f.steps.length} {f.steps.length === 1 ? "bloco" : "blocos"}
                </p>
              </Link>
              <div className="flex gap-1.5 text-xs">
                {(f.stats.RUNNING ?? 0) + (f.stats.WAITING ?? 0) > 0 && <Badge color="#2340e8">{(f.stats.RUNNING ?? 0) + (f.stats.WAITING ?? 0)} em andamento</Badge>}
                {(f.stats.DONE ?? 0) > 0 && <Badge color="#138a52">{f.stats.DONE} concluídas</Badge>}
                {(f.stats.FAILED ?? 0) > 0 && <Badge color="#c9302c">{f.stats.FAILED} falhas</Badge>}
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
