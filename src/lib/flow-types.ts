// Tipos compartilhados entre o editor de fluxos (cliente) e o executor (worker).

export const TRIGGERS = {
  LEAD_CREATED: "Lead criado (scraper, importação ou manual)",
  MESSAGE_RECEIVED: "Mensagem recebida (opcional: contém palavra-chave)",
  STAGE_CHANGED: "Lead entrou em uma etapa do funil",
  TAG_ADDED: "Tag adicionada ao lead",
  NO_REPLY: "Lead não respondeu após X horas do último envio",
  MANUAL: "Manual (iniciado pela tela do lead ou em massa)",
} as const;

export type TriggerType = keyof typeof TRIGGERS;

export type TriggerConfig = {
  keyword?: string; // MESSAGE_RECEIVED
  stageId?: string; // STAGE_CHANGED
  tag?: string; // TAG_ADDED
  hours?: number; // NO_REPLY
  graphVersion?: number;
  startStepId?: string | null;
};

export type FlowStep = (
  | { type: "send_message"; texts: string[] }
  | { type: "ai_message"; instruction: string; agentId?: string }
  | { type: "wait"; amount: number; unit: "minutes" | "hours" | "days" }
  | { type: "stop_if_replied" }
  | { type: "condition"; field: "websiteStatus" | "tag" | "stageId" | "score" | "city" | "category"; op: "eq" | "neq" | "gte" | "lte" | "contains"; value: string; onFail: "stop" | "skip_next" }
  | { type: "move_stage"; stageId: string }
  | { type: "add_tag"; tag: string }
  | { type: "remove_tag"; tag: string }
  | { type: "set_ai"; enabled: boolean; agentId?: string }
  | { type: "webhook"; url: string }
) & { id?: string; nextStepId?: string | null; falseStepId?: string | null; position?: { x: number; y: number } };

export const STEP_LABELS: Record<FlowStep["type"], string> = {
  send_message: "Enviar mensagem",
  ai_message: "Enviar mensagem gerada pela IA",
  wait: "Aguardar",
  stop_if_replied: "Parar se o lead respondeu",
  condition: "Condição",
  move_stage: "Mover etapa",
  add_tag: "Adicionar tag",
  remove_tag: "Remover tag",
  set_ai: "Ligar/desligar IA",
  webhook: "Chamar webhook",
};

export function defaultStep(type: FlowStep["type"]): FlowStep {
  switch (type) {
    case "send_message":
      return { type, texts: ["{{saudacao}}, tudo bem?"] };
    case "ai_message":
      return { type, instruction: "Escreva um follow-up curto e natural retomando a conversa." };
    case "wait":
      return { type, amount: 1, unit: "days" };
    case "condition":
      return { type, field: "websiteStatus", op: "eq", value: "NONE", onFail: "stop" };
    case "move_stage":
      return { type, stageId: "" };
    case "add_tag":
    case "remove_tag":
      return { type, tag: "" };
    case "set_ai":
      return { type, enabled: true };
    case "webhook":
      return { type, url: "" };
    default:
      return { type } as FlowStep;
  }
}
