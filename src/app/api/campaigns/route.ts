import { prisma } from "@/lib/db";
import { body, route } from "@/lib/api";
import { defaultSession } from "@/lib/waha";
import { CampaignInput } from "@/lib/schemas";

export const GET = route(async () => {
  const campaigns = await prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, include: { agent: { select: { name: true } } } });
  const stats = await prisma.campaignTarget.groupBy({ by: ["campaignId", "status"], _count: true });
  const replies = await prisma.campaignTarget.groupBy({ by: ["campaignId"], where: { repliedAt: { not: null } }, _count: true });
  return campaigns.map((c) => {
    const s = Object.fromEntries(stats.filter((x) => x.campaignId === c.id).map((x) => [x.status, x._count]));
    return {
      ...c,
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
  const data = CampaignInput.parse(await body(req));
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
