import type { FlowStep, TriggerConfig } from "./flow-types";

export function nextStepIndex(steps: FlowStep[], config: TriggerConfig, index: number, branch: "next" | "false" = "next") {
  if (index < 0) return steps.length;
  if (config.graphVersion !== 1) return index + (branch === "false" ? 2 : 1);
  const id = branch === "false" ? steps[index].falseStepId : steps[index].nextStepId;
  if (!id) return steps.length;
  const next = steps.findIndex((step) => step.id === id);
  return next < 0 ? steps.length : next;
}

export function firstStepIndex(steps: FlowStep[], config: TriggerConfig) {
  if (config.graphVersion !== 1) return 0;
  const first = steps.findIndex((step) => step.id === config.startStepId);
  return first < 0 ? steps.length : first;
}

export function validateGraph(steps: FlowStep[], config: TriggerConfig) {
  if (config.graphVersion !== 1) return;
  if (steps.length > 100) throw new Error("A automação pode ter até 100 blocos.");
  const ids = new Set(steps.map((step) => step.id));
  if (ids.size !== steps.length || ids.has(undefined)) throw new Error("Há blocos sem identificador ou repetidos.");
  if (steps.length && !ids.has(config.startStepId ?? undefined)) throw new Error("Conecte o gatilho ao primeiro bloco.");
  for (const step of steps) {
    if (step.nextStepId && !ids.has(step.nextStepId)) throw new Error("Uma conexão aponta para um bloco inexistente.");
    if (step.falseStepId && (!ids.has(step.falseStepId) || step.type !== "condition")) throw new Error("A saída 'Não' precisa partir de uma condição válida.");
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  const byId = new Map(steps.map((step) => [step.id, step]));
  const visit = (id: string) => {
    if (active.has(id)) throw new Error("O fluxo não pode ter conexões em ciclo.");
    if (visited.has(id)) return;
    active.add(id);
    const step = byId.get(id);
    for (const target of [step?.nextStepId, step?.falseStepId]) if (target) visit(target);
    active.delete(id);
    visited.add(id);
  };
  if (config.startStepId) visit(config.startStepId);
  if (steps.some((step) => !visited.has(step.id!))) throw new Error("Conecte todos os blocos ao gatilho.");
}
