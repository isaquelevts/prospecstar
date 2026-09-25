import {
  Agent as SdkAgent,
  ModelRefusalError,
  OpenAIProvider,
  Runner,
  assistant,
  gpt5ReasoningSettingsRequired,
  tool,
  user,
  type AgentInputItem,
  type ModelSettings,
} from "@openai/agents";
import type { Agent, Lead, Stage } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db";
import { getSetting } from "./settings";
import { WEBSITE_STATUS_LABEL } from "./website";
import { TZ, sleep } from "./template";

export const DEFAULT_MODEL = "gpt-5-mini";

// ---------- cliente ----------

let cached: { key: string; runner: Runner } | null = null;

async function openAIKey() {
  const key = await getSetting("OPENAI_API_KEY");
  if (!key) throw new Error("Chave da OpenAI não configurada (Configurações).");
  return key;
}

async function runner() {
  const key = await openAIKey();
  if (cached?.key !== key) {
    // tracing desligado: as conversas dos clientes não são enviadas ao painel de traces da OpenAI
    cached = { key, runner: new Runner({ modelProvider: new OpenAIProvider({ apiKey: key }), tracingDisabled: true }) };
  }
  return cached.runner;
}

/** Modelos de chat disponíveis na conta da chave configurada. */
export async function listModels() {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: await openAIKey() });
  const ids: string[] = [];
  for await (const m of client.models.list()) ids.push(m.id);
  const chat = ids.filter(
    (id) => /^(gpt-|o\d|chatgpt-)/.test(id) && !/(audio|realtime|tts|transcribe|image|search|embedding|instruct|moderation|codex|computer)/.test(id),
  );
  return chat.sort((a, b) => b.localeCompare(a));
}

/** Modelos de raciocínio (gpt-5*, o-series) aceitam "effort"; os demais aceitam temperatura. */
function modelSettings(agent: Agent): ModelSettings {
  const reasoning = /^o\d/.test(agent.model) || gpt5ReasoningSettingsRequired(agent.model);
  if (reasoning) return { reasoning: { effort: agent.effort as "low" } };
  return { temperature: 0.7 };
}

// ---------- contexto ----------

function leadContext(lead: Lead & { stage?: Stage | null }) {
  const now = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short", timeZone: TZ }).format(new Date());
  const extra = Object.entries((lead.customData ?? {}) as Record<string, unknown>)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  return [
    `Data/hora atual: ${now}`,
    `\nDados do lead (empresa com quem você está conversando):`,
    `- Nome: ${lead.name}`,
    lead.category && `- Segmento: ${lead.category}`,
    lead.city && `- Cidade: ${lead.city}${lead.state ? "/" + lead.state : ""}`,
    `- Situação do site: ${WEBSITE_STATUS_LABEL[lead.websiteStatus ?? "NONE"] ?? lead.websiteStatus}${lead.website ? ` (${lead.website})` : ""}`,
    lead.rating != null && `- Avaliação no Google: ${lead.rating} (${lead.reviewsCount ?? 0} avaliações)`,
    lead.stage && `- Etapa atual no funil: ${lead.stage.name}`,
    lead.tags.length > 0 && `- Tags: ${lead.tags.join(", ")}`,
    extra && `Informações já coletadas:\n${extra}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const BASE_RULES = `Regras de atendimento no WhatsApp:
- Escreva como uma pessoa real no WhatsApp: mensagens curtas, linguagem natural em português do Brasil, sem markdown (sem **, #, listas longas).
- Separe ideias diferentes com uma linha em branco; cada bloco vira uma mensagem separada.
- Faça no máximo uma pergunta por vez.
- Nunca invente preços, prazos ou informações que não estejam no seu conhecimento; se não souber, use a ferramenta de transferir para humano.
- Nunca diga que é uma IA, a menos que perguntem diretamente — nesse caso seja honesto.`;

function instructions(agent: Agent, lead: Lead & { stage?: Stage | null }) {
  // parte fixa primeiro (favorece o cache automático de prompt da OpenAI), contexto do lead no fim
  return [agent.systemPrompt.trim(), agent.knowledge.trim() && `Base de conhecimento:\n${agent.knowledge.trim()}`, BASE_RULES, leadContext(lead)]
    .filter(Boolean)
    .join("\n\n");
}

/** Converte o histórico do banco para o formato do Agents SDK (começando por uma mensagem do usuário). */
export function toApiHistory(messages: { direction: string; body: string }[]): AgentInputItem[] {
  const merged: { role: "user" | "assistant"; text: string }[] = [];
  for (const m of messages) {
    const role = m.direction === "IN" ? "user" : "assistant";
    const last = merged[merged.length - 1];
    if (last && last.role === role) last.text += `\n${m.body}`;
    else merged.push({ role, text: m.body });
  }
  if (merged[0]?.role === "assistant") merged.unshift({ role: "user", text: "[início da conversa — a primeira mensagem abaixo foi enviada por nós]" });
  return merged.map((m) => (m.role === "user" ? user(m.text) : assistant(m.text)));
}

// ---------- ferramentas ----------

type Effects = { handoff?: string; optOut?: boolean; log: string[] };

function buildTools(agent: Agent, lead: Lead, stages: Stage[], simulate: boolean, fx: Effects) {
  const leads = () => import("./leads");
  const record = (name: string, args: object) => fx.log.push(`${name}(${JSON.stringify(args)})`);
  const stageNames = stages.map((s) => s.name);
  const tools = [];

  if (agent.canMoveStage && stageNames.length)
    tools.push(
      tool({
        name: "mover_etapa",
        description:
          "Move o lead para outra etapa do funil de vendas quando a conversa avançar (ex: demonstrou interesse, pediu orçamento, fechou).",
        parameters: z.object({ etapa: z.enum(stageNames as [string, ...string[]]) }),
        execute: async ({ etapa }) => {
          record("mover_etapa", { etapa });
          if (simulate) return "ok (simulação)";
          const stage = stages.find((s) => s.name === etapa)!;
          await (await leads()).changeStage(lead.id, stage.id, "IA");
          return `Lead movido para ${stage.name}`;
        },
      }),
    );

  if (agent.canTag)
    tools.push(
      tool({
        name: "adicionar_tag",
        description: "Adiciona uma tag curta ao lead para organização (ex: 'quer-orcamento', 'ecommerce', 'urgente').",
        parameters: z.object({ tag: z.string() }),
        execute: async ({ tag }) => {
          record("adicionar_tag", { tag });
          if (!simulate) await (await leads()).addTags(lead.id, [tag], "IA");
          return "Tag adicionada";
        },
      }),
    );

  if (agent.canSaveInfo)
    tools.push(
      tool({
        name: "salvar_informacao",
        description:
          "Salva uma informação coletada na conversa no cadastro do lead (ex: campo 'orcamento', 'prazo', 'tipo_de_site', 'email', 'nome_responsavel').",
        parameters: z.object({ campo: z.string(), valor: z.string() }),
        execute: async ({ campo, valor }) => {
          record("salvar_informacao", { campo, valor });
          if (simulate) return "ok (simulação)";
          const current = await prisma.lead.findUnique({ where: { id: lead.id }, select: { customData: true } });
          const data = { ...((current?.customData ?? {}) as Record<string, unknown>), [campo]: valor };
          await prisma.lead.update({ where: { id: lead.id }, data: { customData: data as object } });
          await (await leads()).addActivity(lead.id, "ai", `IA salvou ${campo}: ${valor}`);
          return "Informação salva";
        },
      }),
    );

  if (agent.canHandoff)
    tools.push(
      tool({
        name: "transferir_para_humano",
        description:
          "Pausa o atendimento automático e avisa o vendedor humano. Use quando o cliente pedir para falar com uma pessoa, quiser fechar negócio/agendar reunião, fizer perguntas que você não sabe responder, ou houver reclamação.",
        parameters: z.object({ motivo: z.string() }),
        execute: async ({ motivo }) => {
          record("transferir_para_humano", { motivo });
          fx.handoff = motivo;
          return "Vendedor humano será avisado. Informe ao cliente que alguém da equipe vai continuar o atendimento em breve.";
        },
      }),
    );

  tools.push(
    tool({
      name: "marcar_sem_interesse",
      description: "Use quando o cliente disser claramente que não tem interesse ou pedir para não receber mais mensagens. Encerra o contato automático.",
      parameters: z.object({ motivo: z.string() }),
      execute: async ({ motivo }) => {
        record("marcar_sem_interesse", { motivo });
        fx.optOut = true;
        if (!simulate) await (await leads()).addActivity(lead.id, "ai", `IA marcou sem interesse: ${motivo}`);
        return "Registrado. Despeça-se educadamente e não insista.";
      },
    }),
  );
  return tools;
}

// ---------- execução ----------

async function runAgent(agent: Agent, lead: Lead & { stage?: Stage | null }, history: AgentInputItem[], simulate: boolean) {
  const stages = await prisma.stage.findMany({ orderBy: { order: "asc" } });
  const fx: Effects = { log: [] };
  const sdkAgent = new SdkAgent({
    name: agent.name,
    instructions: instructions(agent, lead),
    model: agent.model,
    modelSettings: modelSettings(agent),
    tools: buildTools(agent, lead, stages, simulate, fx),
  });
  try {
    const result = await (await runner()).run(sdkAgent, history, { maxTurns: 8 });
    return { text: String(result.finalOutput ?? "").trim(), fx };
  } catch (e) {
    if (e instanceof ModelRefusalError) {
      fx.handoff = "O modelo recusou responder esta conversa";
      return { text: "", fx };
    }
    throw e;
  }
}

export function splitReply(text: string, split: boolean) {
  if (!text) return [];
  if (!split) return [text];
  const parts = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 4) return parts;
  return [...parts.slice(0, 3), parts.slice(3).join("\n\n")];
}

export async function resolveAgent(agentId?: string | null) {
  if (agentId) {
    const a = await prisma.agent.findUnique({ where: { id: agentId } });
    if (a?.enabled) return a;
  }
  return prisma.agent.findFirst({ where: { enabled: true, isDefault: true } });
}

/** Responde automaticamente a um lead (chamado pelo worker após o debounce). */
export async function replyToLead(leadId: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { stage: true } });
  if (!lead || !lead.aiEnabled || lead.optOut) return { skipped: "ia desligada" };
  const agent = await resolveAgent(lead.agentId);
  if (!agent) return { skipped: "nenhum agente ativo" };

  const recent = await prisma.message.findMany({
    where: { leadId, status: { not: "failed" } },
    orderBy: { createdAt: "desc" },
    take: agent.historyLimit,
  });
  if (!recent.length || recent[0].direction !== "IN") return { skipped: "última mensagem não é do cliente" };

  const { addActivity, changeStage } = await import("./leads");
  let out: Awaited<ReturnType<typeof runAgent>>;
  try {
    out = await runAgent(agent, lead, toApiHistory(recent.reverse()), false);
  } catch (e) {
    await addActivity(leadId, "ai", `Erro da IA: ${String(e instanceof Error ? e.message : e).slice(0, 300)}`);
    throw e;
  }
  const { text, fx } = out;
  const { sendToLead } = await import("./messaging");

  // Se o cliente mandou algo novo enquanto pensávamos, o próximo job responde tudo junto.
  const newer = await prisma.message.count({ where: { leadId, direction: "IN", createdAt: { gt: recent[recent.length - 1].createdAt } } });
  if (newer > 0) return { skipped: "nova mensagem chegou durante o processamento" };

  const fresh = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!fresh?.aiEnabled) return { skipped: "IA desligada durante o processamento" };

  for (const [i, part] of splitReply(text, agent.splitMessages).entries()) {
    if (i > 0) await sleep(800 + Math.random() * 1500);
    await sendToLead(leadId, part, "ai");
  }
  if (fx.log.length) await addActivity(leadId, "ai", `Ações da IA: ${fx.log.join("; ")}`);
  if (fx.optOut) {
    await prisma.lead.update({ where: { id: leadId }, data: { optOut: true, aiEnabled: false } });
    const lost = await prisma.stage.findFirst({ where: { isLost: true } });
    if (lost) await changeStage(leadId, lost.id, "IA");
  }
  if (fx.handoff) {
    await prisma.lead.update({ where: { id: leadId }, data: { aiEnabled: false } });
    await addActivity(leadId, "ai", `IA transferiu para humano: ${fx.handoff}`);
    if (agent.handoffWebhook) {
      await fetch(agent.handoffWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "handoff", reason: fx.handoff, lead: fresh }),
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
    }
  }
  return { sent: text, actions: fx.log };
}

/** Gera uma mensagem única (sem ferramentas) — usado em fluxos para follow-ups personalizados. */
export async function generateMessage(leadId: string, instruction: string, agentId?: string) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { stage: true } });
  const agent = await resolveAgent(agentId ?? lead.agentId);
  if (!agent) throw new Error("Nenhum agente de IA ativo para gerar a mensagem.");
  const recent = await prisma.message.findMany({ where: { leadId }, orderBy: { createdAt: "desc" }, take: 20 });
  const convo = recent
    .reverse()
    .map((m) => `${m.direction === "IN" ? "Cliente" : "Nós"}: ${m.body}`)
    .join("\n");
  const sdkAgent = new SdkAgent({
    name: agent.name,
    instructions: instructions(agent, lead),
    model: agent.model,
    modelSettings: modelSettings(agent),
  });
  const prompt = `${convo ? `Conversa até agora:\n${convo}\n\n` : "Ainda não houve conversa com este lead.\n\n"}Tarefa: ${instruction}\n\nResponda somente com o texto exato da mensagem que será enviada no WhatsApp, sem aspas e sem comentários.`;
  const result = await (await runner()).run(sdkAgent, prompt, { maxTurns: 2 });
  const text = String(result.finalOutput ?? "").trim();
  if (!text) throw new Error("A IA não gerou texto.");
  return text;
}

/** Playground: simula uma conversa com o agente sem enviar nada nem alterar o lead. */
export async function simulateAgent(agentId: string, conversation: { role: "user" | "assistant"; content: string }[], leadId?: string) {
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
  const lead =
    (leadId && (await prisma.lead.findUnique({ where: { id: leadId }, include: { stage: true } }))) ||
    ({
      id: "sim",
      name: "Padaria Pão Quente",
      category: "Padaria",
      city: "Campinas",
      state: "SP",
      websiteStatus: "SOCIAL_ONLY",
      website: "instagram.com/paoquente",
      rating: 4.6,
      reviewsCount: 230,
      tags: [],
      customData: {},
      stage: null,
    } as unknown as Lead & { stage: null });
  const history = toApiHistory(conversation.map((m) => ({ direction: m.role === "user" ? "IN" : "OUT", body: m.content })));
  const { text, fx } = await runAgent(agent, lead, history, true);
  return { parts: splitReply(text, agent.splitMessages), actions: fx.log, handoff: fx.handoff, optOut: fx.optOut };
}
