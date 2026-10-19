import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { startOfToday } from "@/lib/template";

export const GET = route(async () => {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const today = startOfToday();
  const [leads, withPhone, whatsappBooking, stages, sentToday, inToday, sent7, replied7, running, aiOn, recent, byStatus] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { phone: { not: null } } }),
    prisma.lead.count({ where: { bookingStatus: "WHATSAPP" } }),
    prisma.stage.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { leads: true } } } }),
    prisma.message.count({ where: { direction: "OUT", createdAt: { gte: today } } }),
    prisma.message.count({ where: { direction: "IN", createdAt: { gte: today } } }),
    prisma.campaignTarget.count({ where: { status: "SENT", sentAt: { gte: since } } }),
    prisma.campaignTarget.count({ where: { status: "SENT", sentAt: { gte: since }, repliedAt: { not: null } } }),
    prisma.campaign.findMany({ where: { status: "RUNNING" }, select: { id: true, name: true } }),
    prisma.lead.count({ where: { aiEnabled: true } }),
    prisma.lead.findMany({
      where: { lastInboundAt: { not: null } },
      orderBy: { lastInboundAt: "desc" },
      take: 8,
      select: { id: true, name: true, lastInboundAt: true, unread: true, stage: { select: { name: true, color: true } } },
    }),
    prisma.lead.groupBy({ by: ["bookingStatus"], where: { bookingStatus: { not: null } }, _count: true }),
  ]);
  return {
    leads,
    withPhone,
    whatsappBooking,
    sentToday,
    inToday,
    sent7,
    replied7,
    replyRate: sent7 ? Math.round((replied7 / sent7) * 100) : 0,
    aiOn,
    running,
    stages: stages.map((s) => ({ id: s.id, name: s.name, color: s.color, count: s._count.leads })),
    recent,
    byBookingStatus: byStatus.map((b) => ({ status: b.bookingStatus ?? "UNKNOWN", count: b._count })),
  };
});
