"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Empty, PageHeader, api, useAction, useApi } from "@/components/ui";

type Agent = { id: string; name: string; enabled: boolean; isDefault: boolean; model: string; systemPrompt: string; _count: { leads: number } };

export default function AgentsPage() {
  const { data } = useApi<Agent[]>("/api/agents");
  const router = useRouter();
  const { run, busy } = useAction();

  return (
    <>
      <PageHeader
        title="Agentes IA"
        sub="Cada agente tem seu próprio prompt e conhecimento. Ele responde no WhatsApp, move o lead no funil e chama você quando precisa."
        actions={
          <Button
            disabled={busy}
            onClick={async () => {
              const a = await run(() =>
                api<{ id: string }>("/api/agents", {
                  body: { name: "Novo agente", systemPrompt: "Você é um consultor comercial de uma agência que cria sites profissionais." },
                }),
              );
              if (a) router.push(`/agents/${a.id}`);
            }}
          >
            Novo agente
          </Button>
        }
      />
      {data?.length === 0 ? (
        <Empty title="Nenhum agente">Crie um agente para responder automaticamente os leads.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.map((a) => (
            <Link key={a.id} href={`/agents/${a.id}`}>
              <Card className="h-full p-5 transition-colors hover:border-ink/25">
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="font-display text-lg font-bold">{a.name}</h3>
                  {a.isDefault && <Badge className="bg-cobalt-soft text-cobalt">padrão</Badge>}
                  {!a.enabled && <Badge>desligado</Badge>}
                </div>
                <p className="line-clamp-3 text-sm text-mute">{a.systemPrompt}</p>
                <p className="mt-3 font-mono text-xs text-mute">
                  {a.model} · {a._count.leads} leads
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
