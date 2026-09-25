import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, route } from "@/lib/api";
import { CampaignInput } from "@/lib/schemas";
import { pauseCampaign, populateTargets, startCampaign } from "@/lib/campaigns";
import { buildLeadWhere } from "@/lib/leads";

export const GET = route<{ id: string }>(async (req, { id }) => {
  const status = new URL(req.url).searchParams.get("status") || undefined;
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id } });
  const targets = await prisma.campaignTarget.findMany({
    where: { campaignId: id, ...(status ? { status } : {}) },
    orderBy: [{ sentAt: "desc" }, { id: "asc" }],
    take: 300,
    include: { lead: { select: { id: true, name: true, phone: true, city: true } } },
  });
  return { campaign, targets };
});

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const data = CampaignInput.partial().parse(await body(req));
  return prisma.campaign.update({ where: { id }, data });
});

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  await prisma.campaign.delete({ where: { id } });
  return { ok: true };
});

/** Ações: populate (adiciona leads do filtro), count (prévia), start, pause, reset_failed. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { action } = z.object({ action: z.enum(["populate", "count", "start", "pause", "reset_failed"]) }).parse(await body(req));
  const c = await prisma.campaign.findUniqueOrThrow({ where: { id } });
  switch (action) {
    case "count":
      return {
        count: await prisma.lead.count({
          where: { ...buildLeadWhere(c.filter as object), optOut: false, phone: { not: null }, waExists: { not: false } },
        }),
      };
    case "populate":
      return { added: await populateTargets(id, c.filter as object) };
    case "start": {
      const pending = await prisma.campaignTarget.count({ where: { campaignId: id, status: "PENDING" } });
      if (!pending) throw new Error("Nenhum lead pendente. Adicione leads à campanha primeiro.");
      if (!c.templates.some((t) => t.trim())) throw new Error("Adicione pelo menos uma mensagem.");
      await startCampaign(id);
      return { ok: true };
    }
    case "pause":
      await pauseCampaign(id);
      return { ok: true };
    case "reset_failed": {
      const r = await prisma.campaignTarget.updateMany({ where: { campaignId: id, status: "FAILED" }, data: { status: "PENDING", error: null } });
      return { reset: r.count };
    }
  }
});
