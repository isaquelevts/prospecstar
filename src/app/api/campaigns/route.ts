import { prisma } from "@/lib/db";
import { body, route } from "@/lib/api";
import { defaultSession } from "@/lib/waha";
import { startOfToday } from "@/lib/template";
import { CampaignInput } from "@/lib/schemas";
import { DEFAULT_TEMPLATES } from "@/lib/campaigns";

export const GET = route(async () => {
  const campaigns = await prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, include: { agent: { select: { name: true } } } });
  const stats = await prisma.campaignTarget.groupBy({ by: ["campaignId", "status"], _count: true });
  const replies = await prisma.campaignTarget.groupBy({ by: ["campaignId"], where: { repliedAt: { not: null } }, _count: true });
  const today = await prisma.campaignTarget.groupBy({ by: ["campaignId"], where: { status: "SENT", sentAt: { gte: startOfToday() } }, _count: true });
  return campaigns.map((c) => {
    const s = Object.fromEntries(stats.filter((x) => x.campaignId === c.id).map((x) => [x.status, x._count]));
    return {
      ...c,
      sentToday: today.find((t) => t.campaignId === c.id)?._count ?? 0,
      stats: {
        pending: s.PENDING ?? 0,
        sending: s.SENDING ?? 0,
        sent: s.SENT ?? 0,
        failed: s.FAILED ?? 0,
        skipped: s.SKIPPED ?? 0,
        replied: replies.find((r) => r.campaignId === c.id)?._count ?? 0,
      },
    };
  });
});

export const POST = route(async (req) => {
  const input = await body(req);
  // "Nova campanha" sem dados: reaproveita um rascunho vazio e intocado em vez de criar outro
  if (!input?.templates) {
    const drafts = await prisma.campaign.findMany({
      where: { status: "DRAFT", startedAt: null, targets: { none: {} } },
      orderBy: { createdAt: "desc" },
    });
    const untouched = drafts.find((d) => JSON.stringify(d.templates) === JSON.stringify(DEFAULT_TEMPLATES));
    if (untouched) return untouched;
  }
  const data = CampaignInput.parse({
    name: `Campanha ${new Date().toLocaleDateString("pt-BR", { timeZone: process.env.TZ || "America/Sao_Paulo" })}`,
    templates: DEFAULT_TEMPLATES,
    filter: { neverContacted: true },
    ...input,
  });
  const contacted = await prisma.stage.findUnique({ where: { name: "Contatado" } });
  const agent = await prisma.agent.findFirst({ where: { isDefault: true, enabled: true } });
  return prisma.campaign.create({
    data: {
      moveToStageId: contacted?.id,
      agentId: agent?.id,
      ...data,
      session: data.session || (await defaultSession()),
      templates: data.templates.filter((t) => t.trim()),
    },
  });
});
