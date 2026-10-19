import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, route } from "@/lib/api";
import { CampaignInput } from "@/lib/schemas";
import {
  QUEUE_ORDER,
  campaignAudienceWhere,
  globalDailyLimit,
  pauseCampaign,
  populateTargets,
  sentToday,
  startCampaign,
} from "@/lib/campaigns";

const PAGE = 100;

export const GET = route<{ id: string }>(async (req, { id }) => {
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") || undefined;
  const q = (sp.get("q") ?? "").trim();
  const take = Math.min(500, Math.max(1, Number(sp.get("take")) || PAGE));
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id } });

  const digits = q.replace(/\D/g, "");
  const search = q
    ? { lead: { OR: [{ name: { contains: q, mode: "insensitive" as const } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] } }
    : {};
  const where = { campaignId: id, ...(status ? { status } : {}), ...search };

  const [targets, total, grouped, replied, today, globalToday, globalLimit, next, lastSent] = await Promise.all([
    prisma.campaignTarget.findMany({
      where,
      orderBy: status === "PENDING" ? QUEUE_ORDER : [{ sentAt: { sort: "desc", nulls: "last" } }, { id: "asc" }],
      take,
      include: { lead: { select: { id: true, name: true, phone: true, city: true, score: true } } },
    }),
    prisma.campaignTarget.count({ where }),
    prisma.campaignTarget.groupBy({ by: ["status"], where: { campaignId: id }, _count: true }),
    prisma.campaignTarget.count({ where: { campaignId: id, repliedAt: { not: null } } }),
    sentToday(id),
    sentToday(),
    globalDailyLimit(),
    prisma.campaignTarget.findFirst({ where: { campaignId: id, status: "PENDING" }, orderBy: QUEUE_ORDER, include: { lead: { select: { id: true, name: true } } } }),
    prisma.campaignTarget.findFirst({
      where: { campaignId: id, status: "SENT" },
      orderBy: { sentAt: "desc" },
      include: { lead: { select: { id: true, name: true } } },
    }),
  ]);
  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count])) as Record<string, number>;
  return {
    campaign,
    targets,
    total,
    counts: {
      pending: (counts.PENDING ?? 0) + (counts.SENDING ?? 0),
      sent: counts.SENT ?? 0,
      failed: counts.FAILED ?? 0,
      skipped: counts.SKIPPED ?? 0,
      replied,
    },
    sentToday: today,
    globalSentToday: globalToday,
    dailyLimitGlobal: globalLimit,
    next: next ? { leadId: next.lead.id, name: next.lead.name } : null,
    lastSent: lastSent ? { leadId: lastSent.lead.id, name: lastSent.lead.name, sentAt: lastSent.sentAt, message: lastSent.message } : null,
  };
});

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const data = CampaignInput.partial().parse(await body(req));
  return prisma.campaign.update({ where: { id }, data });
});

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  await prisma.campaign.delete({ where: { id } });
  return { ok: true };
});

const Action = z.object({
  action: z.enum(["populate", "count", "start", "pause", "reset_failed", "retry_one", "duplicate"]),
  targetId: z.string().optional(),
});

/** Ações: populate, count (prévia), start, pause, reset_failed, retry_one (um destinatário) e duplicate. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { action, targetId } = Action.parse(await body(req));
  const c = await prisma.campaign.findUniqueOrThrow({ where: { id } });
  switch (action) {
    case "count":
      return { count: await prisma.lead.count({ where: campaignAudienceWhere(c.filter as object) }) };
    case "populate":
      return { added: await populateTargets(id, c.filter as object) };
    case "start": {
      if (!c.templates.some((t) => t.trim())) throw new Error("Adicione pelo menos uma mensagem.");
      // sem fila ainda: adiciona automaticamente quem bate com o filtro
      let added = 0;
      if (c.status === "DRAFT") added = await populateTargets(id, c.filter as object);
      const pending = await prisma.campaignTarget.count({ where: { campaignId: id, status: "PENDING" } });
      if (!pending) throw new Error("Nenhum lead para receber. Ajuste o filtro em “Quem vai receber”.");
      await startCampaign(id);
      return { ok: true, added, pending };
    }
    case "pause":
      await pauseCampaign(id);
      return { ok: true };
    case "reset_failed": {
      const r = await prisma.campaignTarget.updateMany({
        where: { campaignId: id, status: "FAILED" },
        data: { status: "PENDING", error: null, attempts: 0 },
      });
      return { reset: r.count };
    }
    case "retry_one": {
      if (!targetId) throw new Error("Destinatário não informado.");
      const r = await prisma.campaignTarget.updateMany({
        where: { id: targetId, campaignId: id, status: { in: ["FAILED", "SKIPPED"] } },
        data: { status: "PENDING", error: null, attempts: 0 },
      });
      if (!r.count) throw new Error("Esse destinatário não está mais com falha.");
      return { ok: true };
    }
    case "duplicate": {
      const copy = await prisma.campaign.create({
        data: {
          name: `${c.name} (cópia)`,
          session: c.session,
          templates: c.templates,
          filter: c.filter as object,
          minDelaySec: c.minDelaySec,
          maxDelaySec: c.maxDelaySec,
          dailyLimit: c.dailyLimit,
          windowStart: c.windowStart,
          windowEnd: c.windowEnd,
          weekdays: c.weekdays,
          agentId: c.agentId,
          moveToStageId: c.moveToStageId,
        },
      });
      return { id: copy.id };
    }
  }
});
