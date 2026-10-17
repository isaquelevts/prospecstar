import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { route } from "@/lib/api";

const FILTERS: Record<string, Prisma.LeadWhereInput> = {
  all: {},
  unread: { unread: { gt: 0 } },
  ai: { aiEnabled: true },
  // o cliente falou por último e a IA está desligada: alguém precisa responder
  human: { aiEnabled: false, lastInboundAt: { not: null } },
};

export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const filter = FILTERS[sp.get("filter") ?? "all"] ? (sp.get("filter") ?? "all") : "all";
  const base: Prisma.LeadWhereInput = {
    lastMessageAt: { not: null },
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\D/g, "") || q } }] } : {}),
  };
  const [items, ...counts] = await Promise.all([
    prisma.lead.findMany({
      where: { ...base, ...FILTERS[filter] },
      orderBy: { lastMessageAt: "desc" },
      take: 150,
      select: {
        id: true,
        name: true,
        phone: true,
        unread: true,
        aiEnabled: true,
        optOut: true,
        lastMessageAt: true,
        stage: { select: { name: true, color: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, direction: true, status: true, author: true } },
      },
    }),
    ...Object.values(FILTERS).map((f) => prisma.lead.count({ where: { ...base, ...f } })),
  ]);
  const unreadTotal = await prisma.lead.count({ where: { lastMessageAt: { not: null }, unread: { gt: 0 } } });
  return {
    items,
    counts: Object.fromEntries(Object.keys(FILTERS).map((k, i) => [k, counts[i]])),
    unreadTotal,
  };
});
