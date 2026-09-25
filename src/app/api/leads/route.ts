import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, route } from "@/lib/api";
import { buildLeadWhere, createLeadIfNew, parseLeadFilter } from "@/lib/leads";

export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(200, Number(sp.get("pageSize") ?? 50));
  const sort = sp.get("sort") ?? "score";
  const where = buildLeadWhere(parseLeadFilter(sp));
  const orderBy =
    sort === "recent" ? { createdAt: "desc" as const } : sort === "name" ? { name: "asc" as const } : [{ score: "desc" as const }, { createdAt: "desc" as const }];
  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { stage: { select: { id: true, name: true, color: true } } },
    }),
    prisma.lead.count({ where }),
  ]);
  return { items, total, page, pageSize };
});

const CreateLead = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  city: z.string().optional(),
  category: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const POST = route(async (req) => {
  const data = CreateLead.parse(await body(req));
  const res = await createLeadIfNew(data, { source: "manual" });
  if (!res.created) throw new Error(res.reason === "duplicado" ? "Já existe um lead com esse telefone." : `Não criado: ${res.reason}`);
  return res.lead;
});
