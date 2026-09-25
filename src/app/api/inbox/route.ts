import { prisma } from "@/lib/db";
import { route } from "@/lib/api";

export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q") ?? "";
  const filter = sp.get("filter") ?? "all"; // all | unread | ai | human
  const leads = await prisma.lead.findMany({
    where: {
      lastMessageAt: { not: null },
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}),
      ...(filter === "unread" ? { unread: { gt: 0 } } : {}),
      ...(filter === "ai" ? { aiEnabled: true } : {}),
      ...(filter === "human" ? { aiEnabled: false, lastInboundAt: { not: null } } : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      phone: true,
      unread: true,
      aiEnabled: true,
      lastMessageAt: true,
      stage: { select: { name: true, color: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, direction: true } },
    },
  });
  return leads;
});
