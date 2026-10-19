import { randomUUID } from "crypto";
import type { Campaign, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { queue } from "./queue";
import { buildLeadWhere, addActivity, changeStage, type LeadFilter } from "./leads";
import { leadVariables, pick, randomBetween, renderTemplate, TZ } from "./template";
import { sendToLead } from "./messaging";
import { getSettings } from "./settings";

/** Mensagens padrão de uma campanha nova: variações + spintax para nenhum lead receber o mesmo texto. */
export const DEFAULT_TEMPLATES = [
  "{{saudacao}}, tudo bem? Vi a {{nome}} no Google e {achei muito bem avaliada|gostei das avaliações de vocês}! Notei que vocês ainda não têm um site próprio. Posso te mostrar em 2 minutos como um site pode trazer mais clientes pra vocês?",
  "{{saudacao_informal}}! {Encontrei|Achei} a {{nome}} {pesquisando no Google|no Google Maps} e {gostei bastante do que vi|vi que vocês são bem avaliados}. Vocês já pensaram em ter um site? {Faço sites para empresas da região|Trabalho com sites para negócios locais} e {posso te mostrar uns exemplos|queria te mostrar como funciona}, sem compromisso.",
  "{{saudacao}}! {Tudo certo por aí?|Tudo bem?} Sou {desenvolvedor|criador} de sites e {vi|encontrei} a {{nome}} no Google. {Reparei|Percebi} que vocês ainda não têm site — {quer que eu te mostre|posso te mandar} {um exemplo|uma ideia} de como ficaria o de vocês?",
];

/** Quantas falhas seguidas pausam a campanha sozinha (protege o número e a lista). */
const MAX_FAIL_STREAK = 3;
/** Tentativas por destinatário antes de marcar como "Falhou". */
const MAX_ATTEMPTS = 3;
/** Não manda para quem recebeu outra campanha nesse período. */
const OTHER_CAMPAIGN_DAYS = 30;

const DAY_NAMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function nowParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday, hhmm: `${get("hour")}:${get("minute")}` };
}

export function insideWindow(c: { windowStart: string; windowEnd: string; weekdays: number[] }) {
  const { weekday, hhmm } = nowParts();
  return c.weekdays.includes(weekday) && hhmm >= c.windowStart && hhmm < c.windowEnd;
}

function windowLabel(c: { windowStart: string; windowEnd: string; weekdays: number[] }) {
  const days = [...c.weekdays].sort().map((d) => DAY_NAMES[d]).join(", ");
  return `${days}, ${c.windowStart}–${c.windowEnd}`;
}

/** Envios de campanha hoje (no fuso configurado); sem campaignId conta todas as campanhas do número. */
async function sentToday(campaignId?: string) {
  const rows = campaignId
    ? await prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*)::bigint AS n FROM "CampaignTarget"
        WHERE "campaignId" = ${campaignId} AND status = 'SENT'
          AND ("sentAt" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date`
    : await prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*)::bigint AS n FROM "CampaignTarget"
        WHERE status = 'SENT'
          AND ("sentAt" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date`;
  return Number(rows[0]?.n ?? 0);
}

export async function globalDailyLimit() {
  const n = Number((await getSettings()).DAILY_SEND_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

/**
 * Público de uma campanha: o filtro + quem pode receber prospecção
 * (sem opt-out, com telefone, com WhatsApp e que ainda não está conversando com você).
 */
export function campaignAudienceWhere(filter: LeadFilter): Prisma.LeadWhereInput {
  return { ...buildLeadWhere(filter), optOut: false, phone: { not: null }, waExists: { not: false }, lastInboundAt: null };
}

/** Adiciona à campanha os leads que batem com o filtro (ignora opt-out, sem telefone e já incluídos). */
export async function populateTargets(campaignId: string, filter: LeadFilter, leadIds?: string[]) {
  const where = leadIds?.length
    ? { id: { in: leadIds }, optOut: false, phone: { not: null }, waExists: { not: false } }
    : campaignAudienceWhere(filter);
  const leads = await prisma.lead.findMany({
    where,
    select: { id: true },
    orderBy: { score: "desc" },
    take: 10_000,
  });
  const res = await prisma.campaignTarget.createMany({
    data: leads.map((l) => ({ campaignId, leadId: l.id })),
    skipDuplicates: true,
  });
  return res.count;
}

export async function startCampaign(id: string) {
  const token = randomUUID();
  await prisma.campaign.update({
    where: { id },
    data: { status: "RUNNING", tickToken: token, startedAt: new Date(), failStreak: 0, lastError: null, waitReason: "Iniciando…", nextRunAt: new Date() },
  });
  await queue("campaign").add("tick", { campaignId: id, token });
}

export async function pauseCampaign(id: string, reason?: string) {
  await prisma.campaign.update({
    where: { id },
    data: { status: "PAUSED", tickToken: null, waitReason: null, nextRunAt: null, ...(reason ? { lastError: reason } : {}) },
  });
}

/** Um "tick" envia no máximo uma mensagem e agenda o próximo com atraso aleatório. */
export async function campaignTick(campaignId: string, token: string) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c || c.status !== "RUNNING" || c.tickToken !== token) return;
  const next = async (ms: number, waitReason: string | null = null) => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { waitReason, nextRunAt: new Date(Date.now() + ms) } });
    return queue("campaign").add("tick", { campaignId, token }, { delay: ms });
  };
  try {
    return await tick(c, next);
  } catch (e) {
    // Qualquer erro inesperado não pode matar a corrente de ticks: tenta de novo em 1 minuto.
    console.error(`campanha ${campaignId}: erro no tick`, e);
    await prisma.campaignTarget.updateMany({ where: { campaignId, status: "SENDING" }, data: { status: "PENDING" } }).catch(() => null);
    return next(60_000, "Erro interno — tentando de novo em 1 minuto").catch(() => null);
  }
}

type LeadForSkip = { id: string; optOut: boolean; phone: string | null; waExists: boolean | null; lastInboundAt: Date | null; lastOutboundAt: Date | null };

/** Motivo para não mandar a campanha a este lead agora (já conversa, já recebeu outra campanha…). */
async function skipReason(c: Campaign, lead: LeadForSkip) {
  if (lead.optOut) return "pediu para não receber mensagens";
  if (!lead.phone || lead.waExists === false) return "sem WhatsApp";
  if (lead.lastInboundAt) return "já está conversando com você";
  if ((c.filter as LeadFilter | null)?.neverContacted && lead.lastOutboundAt) return "já foi contatado";
  const other = await prisma.campaignTarget.findFirst({
    where: {
      leadId: lead.id,
      campaignId: { not: c.id },
      status: "SENT",
      sentAt: { gte: new Date(Date.now() - OTHER_CAMPAIGN_DAYS * 86_400_000) },
    },
    select: { id: true },
  });
  if (other) return `já recebeu outra campanha nos últimos ${OTHER_CAMPAIGN_DAYS} dias`;
  return null;
}

async function tick(c: Campaign, next: (ms: number, waitReason?: string | null) => Promise<unknown>) {
  const campaignId = c.id;
  if (!insideWindow(c)) return next(10 * 60_000, `Fora do horário de envio (${windowLabel(c)})`);
  if ((await sentToday(c.id)) >= c.dailyLimit) return next(30 * 60_000, `Limite diário da campanha atingido (${c.dailyLimit}) — continua amanhã`);
  const globalLimit = await globalDailyLimit();
  if ((await sentToday()) >= globalLimit)
    return next(30 * 60_000, `Limite diário do número atingido (${globalLimit}, somando todas as campanhas) — continua amanhã`);

  const templates = c.templates.filter((t) => t.trim());
  if (!templates.length) return pauseCampaign(c.id, "Pausada: a campanha não tem nenhuma mensagem.");

  const target = await prisma.campaignTarget.findFirst({
    where: { campaignId, status: "PENDING" },
    orderBy: [{ attempts: "asc" }, { lead: { score: "desc" } }, { id: "asc" }],
    include: { lead: true },
  });
  if (!target) {
    await prisma.campaign.update({
      where: { id: c.id },
      data: { status: "DONE", finishedAt: new Date(), tickToken: null, waitReason: null, nextRunAt: null },
    });
    return;
  }

  // Reserva o destinatário de forma atômica para a tela não removê-lo depois que o envio começou.
  const claimed = await prisma.campaignTarget.updateMany({
    where: { id: target.id, status: "PENDING" },
    data: { status: "SENDING" },
  });
  if (claimed.count === 0) return next(1000);

  const lead = target.lead;
  const skip = await skipReason(c, lead);
  if (skip) {
    await prisma.campaignTarget.update({ where: { id: target.id }, data: { status: "SKIPPED", error: skip } });
    return next(1000);
  }

  const text = renderTemplate(pick(templates), leadVariables(lead));
  try {
    // sempre a sessão atual do sistema (a gravada na campanha pode ser de uma conexão antiga)
    await sendToLead(lead.id, text, "campaign");
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    const requeue = () => prisma.campaignTarget.update({ where: { id: target.id }, data: { status: "PENDING" } });

    // número sem WhatsApp não conta como envio nem como falha: segue rápido para o próximo
    if (msg.includes("não tem WhatsApp")) {
      await prisma.campaignTarget.update({ where: { id: target.id }, data: { status: "SKIPPED", error: "sem WhatsApp" } });
      return next(randomBetween(3000, 8000));
    }
    // WhatsApp desconectado ou recém-conectado: devolve para a fila e espera, sem gastar tentativa
    if (msg.includes("não está conectado")) {
      await requeue();
      return next(5 * 60_000, "WhatsApp desconectado — aguardando reconectar");
    }
    if (msg.includes("ainda está sincronizando") || msg.includes("está recarregando")) {
      await requeue();
      return next(60_000, "WhatsApp sincronizando — retoma em instantes");
    }

    // falha temporária (timeout, erro do WAHA…): tenta de novo mais tarde; desiste do lead após MAX_ATTEMPTS
    const attempts = target.attempts + 1;
    await prisma.campaignTarget.update({
      where: { id: target.id },
      data: { attempts, status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING", error: msg.slice(0, 500) },
    });
    const streak = c.failStreak + 1;
    await prisma.campaign.update({ where: { id: c.id }, data: { failStreak: streak, lastError: msg.slice(0, 500) } });
    if (streak >= MAX_FAIL_STREAK) {
      await pauseCampaign(c.id, `Pausada automaticamente após ${streak} falhas seguidas. Último erro: ${msg.slice(0, 300)}`);
      return;
    }
    return next(randomBetween(c.minDelaySec, c.maxDelaySec) * 1000, `Falha no último envio — tentando de novo (${streak}/${MAX_FAIL_STREAK})`);
  }

  await prisma.campaignTarget.update({
    where: { id: target.id },
    data: { status: "SENT", sentAt: new Date(), message: text, attempts: target.attempts + 1, error: null },
  });
  if (c.failStreak || c.lastError) await prisma.campaign.update({ where: { id: c.id }, data: { failStreak: 0, lastError: null } });
  if (c.agentId) await prisma.lead.update({ where: { id: lead.id }, data: { agentId: c.agentId, aiEnabled: true } });
  await addActivity(lead.id, "campaign", `Mensagem da campanha "${c.name}" enviada`);
  if (c.moveToStageId) await changeStage(lead.id, c.moveToStageId, `campanha "${c.name}"`);
  return next(randomBetween(c.minDelaySec, c.maxDelaySec) * 1000);
}
