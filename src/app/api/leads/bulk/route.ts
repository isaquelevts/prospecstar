import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, route } from "@/lib/api";
import { addTags, buildLeadWhere, changeStage, removeTags } from "@/lib/leads";
import { queue } from "@/lib/queue";
import { startFlow } from "@/lib/flows";
import { populateTargets } from "@/lib/campaigns";

const Bulk = z.object({
  ids: z.array(z.string()).optional(),
  filter: z.record(z.string(), z.any()).optional(), // aplica a todos que batem com o filtro
  action: z.enum(["tag", "untag", "stage", "delete", "enrich", "ai_on", "ai_off", "flow", "campaign", "opt_in"]),
  value: z.string().optional(),
});

export const POST = route(async (req) => {
  const { ids, filter, action, value } = Bulk.parse(await body(req));
  const where = ids?.length ? { id: { in: ids } } : buildLeadWhere(filter ?? {});
  const leads = await prisma.lead.findMany({ where, select: { id: true }, take: 20_000 });
  const leadIds = leads.map((l) => l.id);

  switch (action) {
    case "tag":
      for (const id of leadIds) await addTags(id, [value!]);
      break;
    case "untag":
      for (const id of leadIds) await removeTags(id, [value!]);
      break;
    case "stage":
      for (const id of leadIds) await changeStage(id, value!);
      break;
    case "delete":
      await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
      break;
    case "enrich":
      await queue("enrich").addBulk(leadIds.map((leadId) => ({ name: "enrich", data: { leadId } })));
      break;
    case "ai_on":
      await prisma.lead.updateMany({ where: { id: { in: leadIds } }, data: { aiEnabled: true, ...(value ? { agentId: value } : {}) } });
      break;
    case "ai_off":
      await prisma.lead.updateMany({ where: { id: { in: leadIds } }, data: { aiEnabled: false } });
      break;
    case "opt_in":
      await prisma.lead.updateMany({ where: { id: { in: leadIds } }, data: { optOut: false } });
      break;
    case "flow":
      for (const id of leadIds) await startFlow(value!, id);
      break;
    case "campaign":
      return { affected: await populateTargets(value!, {}, leadIds) };
  }
  return { affected: leadIds.length };
});
