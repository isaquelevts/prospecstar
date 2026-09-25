import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, route } from "@/lib/api";
import { buildLeadWhere } from "@/lib/leads";
import { leadVariables, renderTemplate } from "@/lib/template";

/** Prévia: quantos leads batem com o filtro e exemplos de mensagens renderizadas. */
export const POST = route(async (req) => {
  const { templates, filter } = z.object({ templates: z.array(z.string()), filter: z.record(z.string(), z.any()).default({}) }).parse(await body(req));
  const where = { ...buildLeadWhere(filter), optOut: false, phone: { not: null }, waExists: { not: false } };
  const [count, sample] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({ where, take: 3, orderBy: { score: "desc" } }),
  ]);
  const valid = templates.filter((t) => t.trim());
  const examples = valid.length
    ? sample.map((lead, i) => ({ lead: lead.name, text: renderTemplate(valid[i % valid.length], leadVariables(lead)) }))
    : [];
  return { count, examples };
});
