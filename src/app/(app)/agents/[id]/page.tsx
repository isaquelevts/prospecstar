"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { Button, Card, Field, Input, PageHeader, Select, Textarea, Toggle, api, useAction, useApi } from "@/components/ui";

type Agent = {
  id: string;
  name: string;
  enabled: boolean;
  isDefault: boolean;
  model: string;
  effort: string;
  systemPrompt: string;
  knowledge: string;
  debounceSec: number;
  historyLimit: number;
  splitMessages: boolean;
  canMoveStage: boolean;
  canTag: boolean;
  canHandoff: boolean;
  canSaveInfo: boolean;
  handoffWebhook: string | null;
};

const isReasoning = (model: string) => /^(gpt-5|o\d)/.test(model) && !model.includes("chat-latest");

/** Seletor de modelo: carrega os modelos da conta OpenAI e permite digitar um nome manualmente. */
function ModelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data, error, isLoading, mutate } = useApi<{ models: string[] }>("/api/ai/models", { revalidateOnFocus: false, shouldRetryOnError: false });
  const [manual, setManual] = useState(false);
  const models = data?.models ?? [];
  const known = models.includes(value);

  if (manual || error) {
    return (
      <div>
        <div className="flex gap-2">
          <Input value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder="ex: gpt-5-mini" className="font-mono" />
          <Button type="button" variant="outline" onClick={() => (error ? mutate() : setManual(false))}>
            {error ? "Tentar carregar lista" : "Lista"}
          </Button>
        </div>
        {error && <p className="mt-1 text-xs text-bad">Não foi possível listar os modelos: {error.message}</p>}
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Select value={value} onChange={(e) => (e.target.value === "__manual" ? setManual(true) : onChange(e.target.value))} className="font-mono">
        {isLoading && <option value={value}>Carregando modelos…</option>}
        {!known && value && !isLoading && <option value={value}>{value}</option>}
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
        <option value="__manual">Digitar outro nome…</option>
      </Select>
      <Button type="button" variant="ghost" onClick={() => mutate()} title="Recarregar lista de modelos">
        ↻
      </Button>
    </div>
  );
}

type Turn = { role: "user" | "assistant"; content: string; actions?: string[] };

function Playground({ agentId, beforeRun }: { agentId: string; beforeRun: () => Promise<unknown> }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const { run, busy } = useAction();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const next: Turn[] = [...turns, { role: "user", content: text.trim() }];
    setTurns(next);
    setText("");
    await beforeRun();
    const r = await run(() =>
      api<{ parts: string[]; actions: string[]; handoff?: string; optOut?: boolean }>(`/api/agents/${agentId}`, {
        body: { conversation: next.map(({ role, content }) => ({ role, content })) },
      }),
    );
    if (!r) return;
    const actions = [...r.actions, ...(r.handoff ? [`→ transferiria para humano: ${r.handoff}`] : [])];
    setTurns([...next, ...r.parts.map((p, i) => ({ role: "assistant" as const, content: p, actions: i === r.parts.length - 1 ? actions : undefined }))]);
  }

  return (
    <Card className="flex h-[calc(100vh-10rem)] flex-col overflow-hidden xl:sticky xl:top-6">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h2 className="font-display font-bold">Testar agente</h2>
          <p className="text-xs text-mute">Você é o cliente. Nada é enviado nem salvo.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setTurns([])}>
          Limpar
        </Button>
      </div>
      <div className="scroll-thin flex-1 space-y-2 overflow-y-auto bg-paper p-4">
        {turns.length === 0 && (
          <p className="py-8 text-center text-sm text-mute">
            Simule a resposta de um lead, por exemplo:
            <br />
            <em>“Oi, quanto custa um site?”</em>
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`flex flex-col ${t.role === "assistant" ? "items-end" : "items-start"}`}>
            <p
              className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
                t.role === "assistant" ? "rounded-br-sm bg-cobalt text-white" : "rounded-bl-sm border border-line bg-card"
              }`}
            >
              {t.content}
            </p>
            {t.actions?.map((a, j) => (
              <p key={j} className="mt-1 font-mono text-[11px] text-mute">
                ⚙ {a}
              </p>
            ))}
          </div>
        ))}
        {busy && <p className="text-right text-xs text-mute">digitando…</p>}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensagem do cliente" />
        <Button disabled={busy}>Enviar</Button>
      </form>
    </Card>
  );
}

export default function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data } = useApi<Agent>(`/api/agents/${id}`, { revalidateOnFocus: false });
  const [a, setA] = useState<Agent | null>(null);
  const [dirty, setDirty] = useState(false);
  const { run, busy } = useAction();

  useEffect(() => {
    if (data && !a) setA(data);
  }, [data, a]);
  if (!a) return <p className="text-sm text-mute">Carregando…</p>;
  const set = (p: Partial<Agent>) => {
    setA({ ...a, ...p });
    setDirty(true);
  };
  const save = async (silent = false) => {
    if (!dirty && silent) return;
    const { id: _id, ...body } = a;
    const r = await run(() => api(`/api/agents/${id}`, { method: "PATCH", body }), silent ? undefined : "Agente salvo");
    if (r) setDirty(false);
  };

  return (
    <>
      <Link href="/agents" className="text-xs text-mute hover:text-ink">
        ← Agentes
      </Link>
      <PageHeader
        title={a.name}
        actions={
          <>
            <Button
              variant="ghost"
              className="text-bad"
              onClick={async () => {
                if (!confirm("Excluir este agente?")) return;
                await run(() => api(`/api/agents/${id}`, { method: "DELETE" }), "Agente excluído");
                router.push("/agents");
              }}
            >
              Excluir
            </Button>
            <Button disabled={busy || !dirty} onClick={() => save()}>
              Salvar
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome">
                <Input value={a.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field
                label="Modelo da OpenAI"
                hint={
                  <>
                    Lista vinda da sua conta (chave em{" "}
                    <Link href="/settings" className="text-cobalt underline">
                      Configurações
                    </Link>
                    ). Modelos “mini” são mais baratos e rápidos.
                  </>
                }
              >
                <ModelPicker value={a.model} onChange={(m) => set({ model: m })} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-6">
              <Toggle checked={a.enabled} onChange={(v) => set({ enabled: v })} label="Ligado" />
              <Toggle checked={a.isDefault} onChange={(v) => set({ isDefault: v })} label="Agente padrão (atende contatos novos)" />
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <Field
              label="Prompt do agente"
              hint="Quem ele é, o objetivo da conversa, tom de voz e como conduzir até a venda. Os dados do lead (nome, segmento, situação do site) entram automaticamente."
            >
              <Textarea rows={14} value={a.systemPrompt} onChange={(e) => set({ systemPrompt: e.target.value })} className="font-mono text-[13px]" />
            </Field>
            <Field label="Base de conhecimento" hint="Serviços, preços, prazos, formas de pagamento, portfólio, perguntas frequentes. O agente só afirma o que estiver aqui.">
              <Textarea rows={10} value={a.knowledge} onChange={(e) => set({ knowledge: e.target.value })} className="font-mono text-[13px]" />
            </Field>
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="font-display font-bold">O que o agente pode fazer</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle checked={a.canMoveStage} onChange={(v) => set({ canMoveStage: v })} label="Mover o lead no funil" />
              <Toggle checked={a.canTag} onChange={(v) => set({ canTag: v })} label="Adicionar tags" />
              <Toggle checked={a.canSaveInfo} onChange={(v) => set({ canSaveInfo: v })} label="Salvar informações coletadas" />
              <Toggle checked={a.canHandoff} onChange={(v) => set({ canHandoff: v })} label="Chamar você (pausa a IA)" />
            </div>
            <Field label="Avisar em um webhook quando chamar você (opcional)" hint="Ex: um fluxo do n8n que manda notificação no seu WhatsApp pessoal ou Telegram.">
              <Input value={a.handoffWebhook ?? ""} onChange={(e) => set({ handoffWebhook: e.target.value || null })} placeholder="https://…" />
            </Field>
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="font-display font-bold">Comportamento</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Esperar antes de responder (s)" hint="Junta mensagens picadas do cliente numa resposta só.">
                <Input type="number" min={0} value={a.debounceSec} onChange={(e) => set({ debounceSec: Number(e.target.value) })} />
              </Field>
              <Field label="Mensagens de histórico" hint="Quantas mensagens anteriores o agente lê.">
                <Input type="number" min={4} value={a.historyLimit} onChange={(e) => set({ historyLimit: Number(e.target.value) })} />
              </Field>
              <Field
                label="Esforço de raciocínio"
                hint={isReasoning(a.model) ? "Mais esforço = respostas mais cuidadosas, porém mais lentas e caras." : "Só vale para modelos de raciocínio (gpt-5, o3, o4…)."}
              >
                <Select value={a.effort} onChange={(e) => set({ effort: e.target.value })} disabled={!isReasoning(a.model)}>
                  <option value="minimal">Mínimo</option>
                  <option value="low">Baixo</option>
                  <option value="medium">Médio</option>
                  <option value="high">Alto</option>
                </Select>
              </Field>
            </div>
            <Toggle checked={a.splitMessages} onChange={(v) => set({ splitMessages: v })} label="Quebrar a resposta em várias mensagens curtas (mais natural)" />
          </Card>
        </div>

        <Playground agentId={id} beforeRun={() => save(true)} />
      </div>
    </>
  );
}
