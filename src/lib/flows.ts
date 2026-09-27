import type { Flow, FlowRun, Lead, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { queue } from "./queue";
import type { FlowStep, TriggerConfig, TriggerType } from "./flow-types";
import { firstStepIndex, nextStepIndex } from "./flow-graph";
import { leadVariables, pick, renderTemplate } from "./template";

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function matches(flow: Flow, data: Record<string, string | undefined>) {
  const cfg = (flow.triggerConfig ?? {}) as TriggerConfig;
  switch (flow.trigger as TriggerType) {
    case "MESSAGE_RECEIVED": {
      if (!cfg.keyword?.trim()) return true;
      const text = normalize(data.text ?? "");
      return cfg.keyword.split(",").some((k) => k.trim() && text.includes(normalize(k.trim())));
    }
    case "STAGE_CHANGED":
      return !cfg.stageId || cfg.stageId === data.stageId;
    case "TAG_ADDED":
      return !cfg.tag || cfg.tag.trim().toLowerCase() === data.tag;
    default:
      return true;
  }
}

/** Dispara os fluxos ativos que escutam um evento. */
export async function fireTrigger(trigger: TriggerType, leadId: string, data: Record<string, string | undefined> = {}) {
  const flows = await prisma.flow.findMany({ where: { active: true, trigger } });
  for (const flow of flows) {
    if (!matches(flow, data)) continue;
    await startFlow(flow.id, leadId);
  }
}

export async function startFlow(flowId: string, leadId: string) {
  const running = await prisma.flowRun.findFirst({
    where: { flowId, leadId, status: { in: ["RUNNING", "WAITING"] } },
  });
  if (running) return null;
  const flow = await prisma.flow.findUniqueOrThrow({ where: { id: flowId } });
  const run = await prisma.flowRun.create({ data: { flowId, leadId, stepIndex: firstStepIndex(flow.steps as FlowStep[], flow.triggerConfig as TriggerConfig) } });
  await queue("flow").add("run", { runId: run.id });
  return run;
}

export async function stopRunsForLead(leadId: string, reason: string) {
  await prisma.flowRun.updateMany({
    where: { leadId, status: { in: ["RUNNING", "WAITING"] } },
    data: { status: "STOPPED", log: [{ at: new Date().toISOString(), msg: reason }] as Prisma.InputJsonValue },
  });
}

function evalCondition(step: Extract<FlowStep, { type: "condition" }>, lead: Lead) {
  const v = step.value.trim();
  switch (step.field) {
    case "tag": {
      const has = lead.tags.includes(v.toLowerCase());
      return step.op === "neq" ? !has : has;
    }
    case "score": {
      const n = Number(v);
      if (step.op === "gte") return lead.score >= n;
      if (step.op === "lte") return lead.score <= n;
      return step.op === "neq" ? lead.score !== n : lead.score === n;
    }
    default: {
      const actual = String(lead[step.field] ?? "");
      if (step.op === "contains") return normalize(actual).includes(normalize(v));
      if (step.op === "neq") return actual !== v;
      return actual === v;
    }
  }
}

const UNIT_MS = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };

/** Executa passos do fluxo até terminar ou encontrar um "aguardar". Chamado pelo worker. */
export async function executeRun(runId: string) {
  const run = await prisma.flowRun.findUnique({ where: { id: runId }, include: { flow: true } });
  if (!run || !["RUNNING", "WAITING"].includes(run.status)) return;
  const steps = (run.flow.steps ?? []) as FlowStep[];
  const config = run.flow.triggerConfig as TriggerConfig;
  const log = (run.log ?? []) as Array<{ at: string; msg: string }>;
  const note = (msg: string) => log.push({ at: new Date().toISOString(), msg });
  const save = (data: Partial<FlowRun>) =>
    prisma.flowRun.update({ where: { id: run.id }, data: { ...data, log: log as Prisma.InputJsonValue } as Prisma.FlowRunUpdateInput });

  // imports tardios para evitar ciclo de módulos (leads -> flows -> leads)
  const { changeStage, addTags, removeTags, addActivity } = await import("./leads");
  const { sendToLead } = await import("./messaging");
  const { generateMessage } = await import("./ai");

  let i = run.stepIndex;
  while (i < steps.length) {
    const lead = await prisma.lead.findUnique({ where: { id: run.leadId } });
    if (!lead) return save({ status: "STOPPED" });
    if (lead.optOut) {
      note("Lead em opt-out, fluxo encerrado");
      return save({ status: "STOPPED", stepIndex: i });
    }
    const replied = !!lead.lastInboundAt && lead.lastInboundAt > run.createdAt;
    const step = steps[i];

    try {
      switch (step.type) {
        case "send_message":
        case "ai_message": {
          if (run.flow.stopOnReply && replied) {
            note("Lead respondeu — fluxo parado antes do envio");
            return save({ status: "STOPPED", stepIndex: i });
          }
          const text =
            step.type === "send_message"
              ? renderTemplate(pick(step.texts.filter(Boolean)), leadVariables(lead))
              : await generateMessage(lead.id, step.instruction, step.agentId);
          await sendToLead(lead.id, text, "flow");
          note(`Mensagem enviada: ${text.slice(0, 80)}`);
          break;
        }
        case "wait": {
          const ms = Math.max(1, step.amount) * UNIT_MS[step.unit];
          note(`Aguardando ${step.amount} ${step.unit}`);
          await queue("flow").add("run", { runId: run.id }, { delay: ms });
          return save({ status: "WAITING", stepIndex: nextStepIndex(steps, config, i), nextRunAt: new Date(Date.now() + ms) });
        }
        case "stop_if_replied":
          if (replied) {
            note("Lead respondeu — fluxo parado");
            return save({ status: "STOPPED", stepIndex: i });
          }
          break;
        case "condition":
          if (!evalCondition(step, lead)) {
            note(`Condição falsa (${step.field} ${step.op} ${step.value})`);
            if (config.graphVersion === 1) {
              if (!step.falseStepId) return save({ status: "STOPPED", stepIndex: i });
              i = nextStepIndex(steps, config, i, "false");
              await save({ status: "RUNNING", stepIndex: i });
              continue;
            }
            if (step.onFail === "stop") return save({ status: "STOPPED", stepIndex: i });
            i++; // pula o próximo passo
          }
          break;
        case "move_stage":
          if (step.stageId) await changeStage(lead.id, step.stageId, `fluxo "${run.flow.name}"`);
          break;
        case "add_tag":
          if (step.tag) await addTags(lead.id, [step.tag], `fluxo "${run.flow.name}"`);
          break;
        case "remove_tag":
          if (step.tag) await removeTags(lead.id, [step.tag]);
          break;
        case "set_ai":
          await prisma.lead.update({
            where: { id: lead.id },
            data: { aiEnabled: step.enabled, ...(step.agentId ? { agentId: step.agentId } : {}) },
          });
          await addActivity(lead.id, "flow", `IA ${step.enabled ? "ligada" : "desligada"} pelo fluxo "${run.flow.name}"`);
          break;
        case "webhook":
          await fetch(step.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event: "flow_step", flow: run.flow.name, lead }),
            signal: AbortSignal.timeout(15_000),
          });
          break;
      }
    } catch (e) {
      note(`Erro no passo ${i + 1}: ${String(e).slice(0, 300)}`);
      return save({ status: "FAILED", stepIndex: i });
    }
    i = nextStepIndex(steps, config, i);
    await save({ status: "RUNNING", stepIndex: i });
  }
  note("Fluxo concluído");
  await save({ status: "DONE", stepIndex: i, nextRunAt: null });
}

/** Gatilho NO_REPLY: roda periodicamente pelo worker. Cada fluxo dispara no máximo uma vez por período de silêncio. */
export async function checkNoReplyFlows() {
  const flows = await prisma.flow.findMany({ where: { active: true, trigger: "NO_REPLY" } });
  for (const flow of flows) {
    const hours = Number((flow.triggerConfig as TriggerConfig)?.hours ?? 24);
    const cutoff = new Date(Date.now() - hours * 3_600_000);
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT l.id FROM "Lead" l
      WHERE l."optOut" = false
        AND l."lastOutboundAt" IS NOT NULL
        AND l."lastOutboundAt" <= ${cutoff}
        AND l."lastOutboundAt" >= ${flow.createdAt}
        AND (l."lastInboundAt" IS NULL OR l."lastInboundAt" < l."lastOutboundAt")
        AND NOT EXISTS (
          SELECT 1 FROM "FlowRun" r
          WHERE r."flowId" = ${flow.id} AND r."leadId" = l.id
            AND r."createdAt" > COALESCE(l."lastInboundAt", to_timestamp(0))
        )
      LIMIT 200`;
    for (const r of rows) await startFlow(flow.id, r.id);
  }
}
