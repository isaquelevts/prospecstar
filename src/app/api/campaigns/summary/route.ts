import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { globalDailyLimit, sentToday } from "@/lib/campaigns";

/** Visão geral dos disparos do número: enviados hoje x limite, e resposta dos últimos 7 dias. */
export const GET = route(async () => {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [sent, limit, sent7, replied7, running] = await Promise.all([
    sentToday(),
    globalDailyLimit(),
    prisma.campaignTarget.count({ where: { status: "SENT", sentAt: { gte: since } } }),
    prisma.campaignTarget.count({ where: { status: "SENT", sentAt: { gte: since }, repliedAt: { not: null } } }),
    prisma.campaign.count({ where: { status: "RUNNING" } }),
  ]);
  return { sentToday: sent, limit, sent7, replied7, replyRate: sent7 ? Math.round((replied7 / sent7) * 100) : 0, running };
});
