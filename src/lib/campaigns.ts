import { randomUUID } from "crypto";
import type { Campaign } from "@prisma/client";
import { prisma } from "./db";
import { queue } from "./queue";
import { buildLeadWhere, addActivity, changeStage, type LeadFilter } from "./leads";
import { leadVariables, pick, randomBetween, renderTemplate, TZ } from "./template";
import { sendToLead } from "./messaging";

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

async function sentToday(campaignId: string) {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*)::bigint AS n FROM "CampaignTarget"
    WHERE "campaignId" = ${campaignId} AND status = 'SENT'
      AND ("sentAt" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date`;
  return Number(rows[0]?.n ?? 0);
}

/** Adiciona à campanha os leads que batem com o filtro (ignora opt-out, sem telefone e já incluídos). */
export async function populateTargets(campaignId: string, filter: LeadFilter, leadIds?: string[]) {
  const where = leadIds?.length ? { id: { in: leadIds } } : buildLeadWhere(filter);
  const leads = await prisma.lead.findMany({
    where: { ...where, optOut: false, phone: { not: null }, waExists: { not: false } },
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
    data: { status: "RUNNING", tickToken: token, startedAt: new Date() },
  });
  await queue("campaign").add("tick", { campaignId: id, token });
}

export async function pauseCampaign(id: string) {
  await prisma.campaign.update({ where: { id }, data: { status: "PAUSED", tickToken: null } });
}

/** Um "tick" envia no máximo uma mensagem e agenda o próximo com atraso aleatório. */
export async function campaignTick(campaignId: string, token: string) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c || c.status !== "RUNNING" || c.tickToken !== token) return;
  const next = (ms: number) => queue("campaign").add("tick", { campaignId, token }, { delay: ms });
  try {
    return await tick(c, next);
  } catch (e) {
    // Qualquer erro inesperado não pode matar a corrente de ticks: tenta de novo em 1 minuto.
    console.error(`campanha ${campaignId}: erro no tick`, e);
    await prisma.campaignTarget.updateMany({ where: { campaignId, status: "SENDING" }, data: { status: "PENDING" } }).catch(() => null);
    return next(60_000);
  }
}

async function tick(c: Campaign, next: (ms: number) => Promise<unknown>) {
  const campaignId = c.id;
  if (!insideWindow(c)) return next(10 * 60_000);
  if ((await sentToday(c.id)) >= c.dailyLimit) return next(30 * 60_000);

  const templates = c.templates.filter((t) => t.trim());
  if (!templates.length) {
    await prisma.campaign.update({ where: { id: c.id }, data: { status: "PAUSED", tickToken: null } });
    return;
  }

  const target = await prisma.campaignTarget.findFirst({
    where: { campaignId, status: "PENDING" },
    orderBy: [{ lead: { score: "desc" } }, { id: "asc" }],
    include: { lead: true },
  });
  if (!target) {
    await prisma.campaign.update({ where: { id: c.id }, data: { status: "DONE", finishedAt: new Date(), tickToken: null } });
    return;
  }

  // Reserva o destinatário de forma atômica para a tela não removê-lo depois que o envio começou.
  const claimed = await prisma.campaignTarget.updateMany({
    where: { id: target.id, status: "PENDING" },
    data: { status: "SENDING" },
  });
  if (claimed.count === 0) return next(1000);

  const lead = target.lead;
  if (lead.optOut || !lead.phone || lead.waExists === false) {
    await prisma.campaignTarget.update({ where: { id: target.id }, data: { status: "SKIPPED", error: "opt-out ou sem WhatsApp" } });
    return next(1000);
  }

  const text = renderTemplate(pick(templates), leadVariables(lead));
  try {
    await sendToLead(lead.id, text, "campaign", { session: c.session });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    const noWhatsApp = msg.includes("não tem WhatsApp");
    await prisma.campaignTarget.update({
      where: { id: target.id },
      data: { status: noWhatsApp ? "SKIPPED" : "FAILED", error: msg.slice(0, 500) },
    });
    // número sem WhatsApp não conta como envio: segue rápido para o próximo
    if (noWhatsApp) return next(randomBetween(3000, 8000));
    // WhatsApp desconectado: não queima a lista inteira, espera reconectar
    if (msg.includes("não está conectado")) {
      await prisma.campaignTarget.update({ where: { id: target.id }, data: { status: "PENDING", error: null } });
      return next(5 * 60_000);
    }
    // WhatsApp recém-conectado ainda sincronizando: devolve para a fila e tenta daqui a pouco
    if (msg.includes("ainda está sincronizando")) {
      await prisma.campaignTarget.update({ where: { id: target.id }, data: { status: "PENDING", error: null } });
      return next(60_000);
    }
    return next(randomBetween(c.minDelaySec, c.maxDelaySec) * 1000);
  }

  await prisma.campaignTarget.update({
    where: { id: target.id },
    data: { status: "SENT", sentAt: new Date(), message: text },
  });
  if (c.agentId) await prisma.lead.update({ where: { id: lead.id }, data: { agentId: c.agentId, aiEnabled: true } });
  await addActivity(lead.id, "campaign", `Mensagem da campanha "${c.name}" enviada`);
  if (c.moveToStageId) await changeStage(lead.id, c.moveToStageId, `campanha "${c.name}"`);
  return next(randomBetween(c.minDelaySec, c.maxDelaySec) * 1000);
}
